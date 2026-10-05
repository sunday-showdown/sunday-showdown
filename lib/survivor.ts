// Survivor.
//
// Pick one team a week to win. Get it right and you live; get it wrong and you
// are out. You may never pick the same team twice, which is what makes the
// format interesting — spending a good team early costs you later.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SurvivorPickResult } from './types';

export interface SurvivorGame {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * Settle one survivor pick.
 *
 * A tie keeps you alive. Being eliminated by a result nobody picked against is
 * harsher than the format intends, and ties are rare enough that the generous
 * reading is the fair one.
 */
export function gradeSurvivorPick(
  pickedIsHome: boolean,
  game: SurvivorGame,
): SurvivorPickResult {
  if (game.status !== 'final') return 'pending';

  const home = typeof game.homeScore === 'number' && Number.isFinite(game.homeScore) ? game.homeScore : null;
  const away = typeof game.awayScore === 'number' && Number.isFinite(game.awayScore) ? game.awayScore : null;
  if (home === null || away === null) return 'pending';

  const margin = pickedIsHome ? home - away : away - home;
  if (margin > 0) return 'survived';
  if (margin < 0) return 'eliminated';
  return 'push';
}

/** Whether a player is still alive in a pool, from their pick history. */
export function isAlive(results: readonly SurvivorPickResult[]): boolean {
  return !results.includes('eliminated');
}

/** Teams a player has already spent and may not pick again. */
export function usedTeams(picks: readonly { team_abbr: string }[]): Set<string> {
  return new Set(picks.map((p) => p.team_abbr));
}

export interface SurvivorGradingReport {
  season: number;
  week: number;
  picksGraded: number;
  eliminated: number;
  survived: number;
  poolsCompleted: number;
  warnings: string[];
}

interface SurvivorPickRow {
  id: string;
  pool_id: string;
  user_id: string;
  team_abbr: string;
  game_id: string | null;
  is_home: boolean | null;
  result: SurvivorPickResult;
}

/**
 * Grade a week of survivor picks and update pool standing.
 *
 * Idempotent: a pick already settled is skipped, and alive/eliminated counts
 * are recounted from the table rather than incremented.
 */
export async function gradeSurvivorWeek(
  db: SupabaseClient,
  season: number,
  week: number,
): Promise<SurvivorGradingReport> {
  const report: SurvivorGradingReport = {
    season,
    week,
    picksGraded: 0,
    eliminated: 0,
    survived: 0,
    poolsCompleted: 0,
    warnings: [],
  };

  const { data: picks, error } = await db
    .from('survivor_picks')
    .select('id, pool_id, user_id, team_abbr, game_id, is_home, result')
    .eq('season', season)
    .eq('week', week)
    .eq('result', 'pending')
    .returns<SurvivorPickRow[]>();

  if (error) throw new Error(`failed to read survivor picks: ${error.message}`);
  if (!picks || picks.length === 0) return report;

  const gameIds = [...new Set(picks.map((p) => p.game_id).filter((id): id is string => !!id))];
  if (gameIds.length === 0) return report;

  const { data: games, error: gamesError } = await db
    .from('nfl_games')
    .select('id, status, home_score, away_score, home_abbr, away_abbr')
    .in('id', gameIds);

  if (gamesError) throw new Error(`failed to read games: ${gamesError.message}`);

  const gameById = new Map((games ?? []).map((g) => [g.id as string, g]));
  const now = new Date().toISOString();

  for (const pick of picks) {
    const game = pick.game_id ? gameById.get(pick.game_id) : null;
    if (!game) {
      report.warnings.push(`survivor pick ${pick.id}: game missing`);
      continue;
    }

    // Trust the stored side when it is there, but fall back to the abbreviation
    // so a pick saved before is_home existed still grades.
    const pickedIsHome =
      pick.is_home ?? (pick.team_abbr === (game.home_abbr as string));

    const result = gradeSurvivorPick(pickedIsHome, {
      status: game.status as string,
      homeScore: game.home_score as number | null,
      awayScore: game.away_score as number | null,
    });

    if (result === 'pending') continue;

    const { error: updateError } = await db
      .from('survivor_picks')
      .update({
        result,
        graded_at: now,
        eliminated_at: result === 'eliminated' ? now : null,
      })
      .eq('id', pick.id);

    if (updateError) {
      report.warnings.push(`survivor pick ${pick.id}: ${updateError.message}`);
      continue;
    }

    report.picksGraded += 1;
    if (result === 'eliminated') report.eliminated += 1;
    else report.survived += 1;
  }

  const poolIds = [...new Set(picks.map((p) => p.pool_id))];
  for (const poolId of poolIds) {
    await refreshPoolCounts(db, poolId, report);
  }

  return report;
}

/**
 * Recount a pool's alive and eliminated totals.
 *
 * Counted from the picks table rather than incremented, so a re-run cannot
 * drift the numbers.
 */
async function refreshPoolCounts(
  db: SupabaseClient,
  poolId: string,
  report: SurvivorGradingReport,
): Promise<void> {
  const { data: all, error } = await db
    .from('survivor_picks')
    .select('user_id, result')
    .eq('pool_id', poolId)
    .returns<{ user_id: string; result: SurvivorPickResult }[]>();

  if (error) {
    report.warnings.push(`pool ${poolId} counts: ${error.message}`);
    return;
  }

  const byUser = new Map<string, SurvivorPickResult[]>();
  for (const row of all ?? []) {
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.result]);
  }

  const entrants = [...byUser.entries()];
  const alive = entrants.filter(([, results]) => isAlive(results));

  const update: Record<string, unknown> = {
    member_count: entrants.length,
    alive_count: alive.length,
    eliminated_count: entrants.length - alive.length,
  };

  // One survivor left, and at least one person actually went out: the pool has
  // a winner. A pool that has simply not started yet must not be "won".
  if (alive.length === 1 && entrants.length > 1) {
    update.status = 'completed';
    update.winner_id = alive[0]![0];
    update.completed_at = new Date().toISOString();
    report.poolsCompleted += 1;
  }

  const { error: updateError } = await db
    .from('survivor_pools')
    .update(update)
    .eq('id', poolId);

  if (updateError) report.warnings.push(`pool ${poolId}: ${updateError.message}`);
}
