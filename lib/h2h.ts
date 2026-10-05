// Head to head.
//
// Call someone out for a week. Both of you make your normal Pick'em card; at
// the end of the week the higher score wins. It costs nothing and changes
// nothing about scoring — it exists purely to give two people a reason to care
// about each other's card.

import type { SupabaseClient } from '@supabase/supabase-js';

export type H2HOutcome = 'challenger' | 'opponent' | 'tie' | 'pending';

/**
 * Settle a challenge from both weekly totals.
 *
 * Null means that player has nothing graded yet, so the challenge is not ready.
 * A player who simply did not pick scores zero, which is a legitimate loss —
 * that is handled by the caller passing 0, not null.
 */
export function settleChallenge(
  challengerPoints: number | null,
  opponentPoints: number | null,
): H2HOutcome {
  if (challengerPoints === null || opponentPoints === null) return 'pending';
  if (challengerPoints > opponentPoints) return 'challenger';
  if (opponentPoints > challengerPoints) return 'opponent';
  return 'tie';
}

/**
 * The canonical ordering for a pair.
 *
 * h2h_records stores one row per pair with user_a_id < user_b_id, enforced by a
 * check constraint. Without a canonical order the same matchup could end up
 * with two rows disagreeing about the record.
 */
export function canonicalPair(a: string, b: string): { userA: string; userB: string; swapped: boolean } {
  return a < b ? { userA: a, userB: b, swapped: false } : { userA: b, userB: a, swapped: true };
}

export interface H2HReport {
  season: number;
  week: number;
  settled: number;
  expired: number;
  warnings: string[];
}

interface ChallengeRow {
  id: string;
  challenger_id: string;
  opponent_id: string;
  league_id: string;
  season: number;
  week: number;
  status: string;
}

/**
 * Settle every accepted challenge for a week, then update lifetime records.
 *
 * Also expires anything still pending once the week is over — an unanswered
 * challenge should not sit in someone's inbox forever.
 */
export async function gradeH2HWeek(
  db: SupabaseClient,
  season: number,
  week: number,
): Promise<H2HReport> {
  const report: H2HReport = { season, week, settled: 0, expired: 0, warnings: [] };

  const { data: challenges, error } = await db
    .from('h2h_challenges')
    .select('id, challenger_id, opponent_id, league_id, season, week, status')
    .eq('season', season)
    .eq('week', week)
    .in('status', ['accepted', 'pending'])
    .returns<ChallengeRow[]>();

  if (error) throw new Error(`failed to read challenges: ${error.message}`);
  if (!challenges || challenges.length === 0) return report;

  const { data: results, error: resultsError } = await db
    .from('weekly_results')
    .select('league_id, user_id, total_points')
    .eq('season', season)
    .eq('week', week);

  if (resultsError) throw new Error(`failed to read results: ${resultsError.message}`);

  const pointsFor = new Map<string, number>();
  for (const row of results ?? []) {
    pointsFor.set(`${row.league_id}:${row.user_id}`, Number(row.total_points));
  }

  const now = new Date().toISOString();

  for (const challenge of challenges) {
    if (challenge.status === 'pending') {
      // Never accepted, and the week has results: it is dead.
      if (pointsFor.size > 0) {
        const { error: expireError } = await db
          .from('h2h_challenges')
          .update({ status: 'expired', expired_at: now })
          .eq('id', challenge.id);
        if (expireError) report.warnings.push(`challenge ${challenge.id}: ${expireError.message}`);
        else report.expired += 1;
      }
      continue;
    }

    // A player with a graded week but no card scores zero rather than being
    // treated as "not ready" — not picking is a choice and it loses.
    const challengerPoints = pointsFor.get(`${challenge.league_id}:${challenge.challenger_id}`) ?? null;
    const opponentPoints = pointsFor.get(`${challenge.league_id}:${challenge.opponent_id}`) ?? null;
    if (challengerPoints === null && opponentPoints === null) continue;

    const outcome = settleChallenge(challengerPoints ?? 0, opponentPoints ?? 0);
    if (outcome === 'pending') continue;

    const winnerId =
      outcome === 'challenger'
        ? challenge.challenger_id
        : outcome === 'opponent'
          ? challenge.opponent_id
          : null;

    const { error: settleError } = await db
      .from('h2h_challenges')
      .update({
        status: 'completed',
        winner_id: winnerId,
        challenger_score: challengerPoints ?? 0,
        opponent_score: opponentPoints ?? 0,
        completed_at: now,
      })
      .eq('id', challenge.id);

    if (settleError) {
      report.warnings.push(`challenge ${challenge.id}: ${settleError.message}`);
      continue;
    }

    await updateRecord(db, challenge, winnerId, Math.abs((challengerPoints ?? 0) - (opponentPoints ?? 0)), report);
    report.settled += 1;
  }

  return report;
}

/** Fold one settled challenge into the pair's lifetime record. */
async function updateRecord(
  db: SupabaseClient,
  challenge: ChallengeRow,
  winnerId: string | null,
  margin: number,
  report: H2HReport,
): Promise<void> {
  const { userA, userB } = canonicalPair(challenge.challenger_id, challenge.opponent_id);

  const { data: existing, error } = await db
    .from('h2h_records')
    .select('*')
    .eq('league_id', challenge.league_id)
    .eq('user_a_id', userA)
    .eq('user_b_id', userB)
    .maybeSingle();

  if (error) {
    report.warnings.push(`record lookup: ${error.message}`);
    return;
  }

  const aWins = (existing?.user_a_wins ?? 0) + (winnerId === userA ? 1 : 0);
  const bWins = (existing?.user_b_wins ?? 0) + (winnerId === userB ? 1 : 0);
  const ties = (existing?.ties ?? 0) + (winnerId === null ? 1 : 0);

  // A streak belongs to whoever just won; a tie ends it.
  const previousStreakUser = existing?.current_streak_user_id ?? null;
  const streakCount =
    winnerId === null ? 0 : winnerId === previousStreakUser ? (existing?.current_streak_count ?? 0) + 1 : 1;

  const biggestMargin = Number(existing?.biggest_win_margin ?? 0);
  const row = {
    league_id: challenge.league_id,
    user_a_id: userA,
    user_b_id: userB,
    user_a_wins: aWins,
    user_b_wins: bWins,
    ties,
    // The check constraint requires these to agree, so it is computed, never
    // incremented independently.
    total_matchups: aWins + bWins + ties,
    current_streak_user_id: winnerId,
    current_streak_count: streakCount,
    biggest_win_user_id: margin > biggestMargin ? winnerId : (existing?.biggest_win_user_id ?? null),
    biggest_win_margin: Math.max(biggestMargin, margin),
    closest_margin:
      existing?.closest_margin === null || existing?.closest_margin === undefined
        ? margin
        : Math.min(Number(existing.closest_margin), margin),
    last_matchup_at: new Date().toISOString(),
  };

  const { error: upsertError } = await db
    .from('h2h_records')
    .upsert(row, { onConflict: 'league_id,user_a_id,user_b_id' });

  if (upsertError) report.warnings.push(`record upsert: ${upsertError.message}`);
}
