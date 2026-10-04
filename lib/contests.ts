// Contest lifecycle: open a week, then freeze its lines when it locks.
//
// Both operations are idempotent. Opening is guarded by a unique key on
// (league, season, week); freezing is guarded by lines_frozen_at and by a
// unique key on the frozen rows, so a cron that fires twice is harmless.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveLockTime } from './contest';

export interface OpenReport {
  challengesCreated: number;
  leaguesConsidered: number;
  warnings: string[];
}

export interface FreezeReport {
  challengesFrozen: number;
  linesFrozen: number;
  warnings: string[];
}

/**
 * Ensure every active league has a contest for this week.
 *
 * lock_time is computed once, here, and stored. It is deliberately not
 * recomputed later: if ESPN moves a kickoff after the lock has passed, the lock
 * that players actually played against must not move retroactively.
 */
export async function openWeek(
  db: SupabaseClient,
  season: number,
  week: number,
): Promise<OpenReport> {
  const report: OpenReport = { challengesCreated: 0, leaguesConsidered: 0, warnings: [] };

  const { data: games, error: gamesError } = await db
    .from('nfl_games')
    .select('start_time')
    .eq('season', season)
    .eq('week', week);

  if (gamesError) throw new Error(`failed to read slate: ${gamesError.message}`);
  if (!games || games.length === 0) {
    report.warnings.push(`no games on the slate for ${season} week ${week}`);
    return report;
  }

  const lockTime = resolveLockTime(games.map((g) => g.start_time as string));
  if (!lockTime) {
    report.warnings.push(`could not determine a lock time for ${season} week ${week}`);
    return report;
  }

  const { data: leagues, error: leaguesError } = await db
    .from('leagues')
    .select('id')
    .eq('season', season);

  if (leaguesError) throw new Error(`failed to read leagues: ${leaguesError.message}`);
  report.leaguesConsidered = leagues?.length ?? 0;
  if (!leagues || leagues.length === 0) return report;

  const { data: existing, error: existingError } = await db
    .from('pickem_challenges')
    .select('league_id')
    .eq('season', season)
    .eq('week', week);

  if (existingError) throw new Error(`failed to read contests: ${existingError.message}`);
  const have = new Set((existing ?? []).map((c) => c.league_id as string));

  const rows = leagues
    .filter((l) => !have.has(l.id as string))
    .map((l) => ({
      league_id: l.id,
      season,
      week,
      lock_time: lockTime.toISOString(),
    }));

  if (rows.length === 0) return report;

  const { error: insertError, count } = await db
    .from('pickem_challenges')
    .insert(rows, { count: 'exact' });

  if (insertError) {
    report.warnings.push(`contest creation: ${insertError.message}`);
    return report;
  }

  report.challengesCreated = count ?? rows.length;
  return report;
}

/**
 * Freeze the lines for every contest whose lock has passed.
 *
 * Captures the active odds as immutable history. Only runs for contests not
 * already frozen, and only for odds that exist — a market with no posted line
 * is skipped rather than frozen as a null, which would be ungradeable.
 */
export async function freezeLockedContests(db: SupabaseClient): Promise<FreezeReport> {
  const report: FreezeReport = { challengesFrozen: 0, linesFrozen: 0, warnings: [] };
  const now = new Date();

  const { data: due, error: dueError } = await db
    .from('pickem_challenges')
    .select('id, league_id, season, week, lock_time')
    .is('lines_frozen_at', null)
    .lte('lock_time', now.toISOString());

  if (dueError) throw new Error(`failed to read contests due to freeze: ${dueError.message}`);
  if (!due || due.length === 0) return report;

  // One odds read per (season, week) rather than per contest: leagues in the
  // same week share a slate.
  const slates = new Map<string, { season: number; week: number }>();
  for (const challenge of due) {
    slates.set(`${challenge.season}:${challenge.week}`, {
      season: challenge.season as number,
      week: challenge.week as number,
    });
  }

  const oddsBySlate = new Map<string, Record<string, any>[]>();
  for (const [key, slate] of slates) {
    const { data: odds, error: oddsError } = await db
      .from('nfl_game_odds')
      .select('game_id, market_type, selection, line, american_odds, provider, captured_at')
      .eq('season', slate.season)
      .eq('week', slate.week)
      .eq('is_active', true);

    if (oddsError) {
      report.warnings.push(`odds for ${key}: ${oddsError.message}`);
      continue;
    }
    oddsBySlate.set(key, odds ?? []);
  }

  for (const challenge of due) {
    const key = `${challenge.season}:${challenge.week}`;
    const odds = oddsBySlate.get(key);
    if (!odds) continue;

    if (odds.length === 0) {
      report.warnings.push(`contest ${challenge.id}: no active odds to freeze`);
      continue;
    }

    const rows = odds
      // A spread or total with no number cannot be graded, so it is not frozen.
      .filter((o) => o.market_type === 'moneyline' || o.line !== null)
      .map((o) => ({
        challenge_id: challenge.id,
        league_id: challenge.league_id,
        game_id: o.game_id,
        season: challenge.season,
        week: challenge.week,
        market_type: o.market_type,
        selection: o.selection,
        contest_line: o.line,
        contest_odds: o.american_odds,
        provider: o.provider,
        captured_at: o.captured_at,
        frozen_at: now.toISOString(),
        status: 'frozen',
        version: 1,
      }));

    if (rows.length === 0) {
      report.warnings.push(`contest ${challenge.id}: no gradeable lines to freeze`);
      continue;
    }

    // ignoreDuplicates: a re-run must not error on lines already frozen.
    const { error: insertError, count } = await db
      .from('contest_lines')
      .upsert(rows, {
        onConflict: 'challenge_id,game_id,market_type,selection,version',
        ignoreDuplicates: true,
        count: 'exact',
      });

    if (insertError) {
      report.warnings.push(`contest ${challenge.id} freeze: ${insertError.message}`);
      continue;
    }

    const { error: markError } = await db
      .from('pickem_challenges')
      .update({ lines_frozen_at: now.toISOString(), locked_at: challenge.lock_time })
      .eq('id', challenge.id);

    if (markError) {
      report.warnings.push(`contest ${challenge.id} mark frozen: ${markError.message}`);
      continue;
    }

    report.challengesFrozen += 1;
    report.linesFrozen += count ?? rows.length;
  }

  return report;
}
