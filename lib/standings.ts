// Standings, built from weekly_results.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface StandingRow {
  userId: string;
  username: string;
  totalPoints: number;
  weeksPlayed: number;
  weeklyWins: number;
  correctMl: number;
  correctSpread: number;
  correctTotals: number;
  rank: number;
  /**
   * Places gained since before the most recent graded week. Positive is a
   * climb. Null in the first week of a season, when there is nothing to have
   * moved from.
   */
  movement: number | null;
  /** The best single week anyone has had, for the board that ranks on it. */
  bestWeek: number;
  /**
   * TD Scorer points, kept apart from totalPoints on purpose: a long shot pays
   * several times a pick'em win, so one lucky touchdown would decide the season
   * table. TD Scorer gets its own board instead. See rollUpTdPoints.
   */
  tdPoints: number;
}

interface ResultRow {
  user_id: string;
  total_points: number;
  td_points: number;
  correct_ml: number;
  correct_spread: number;
  correct_totals: number;
  is_winner: boolean;
  week: number;
}

/**
 * Season standings for a league.
 *
 * Two queries regardless of league size: the results, then the names. Joining
 * per row was the N+1 pattern the previous build used here.
 */
export async function loadSeasonStandings(
  db: SupabaseClient,
  leagueId: string,
  season: number,
): Promise<StandingRow[]> {
  const { data: results, error } = await db
    .from('weekly_results')
    .select('user_id, total_points, td_points, correct_ml, correct_spread, correct_totals, is_winner, week')
    .eq('league_id', leagueId)
    .eq('season', season)
    .returns<ResultRow[]>();

  if (error) throw new Error(`failed to load standings: ${error.message}`);
  if (!results || results.length === 0) return [];

  const byUser = tally(results);

  const { data: profiles, error: profileError } = await db
    .from('profiles')
    .select('user_id, username')
    .in('user_id', [...byUser.keys()]);

  if (profileError) throw new Error(`failed to load names: ${profileError.message}`);
  const nameById = new Map((profiles ?? []).map((p) => [p.user_id as string, p.username as string]));

  // Where everyone stood before the latest graded week, so the table can show
  // who is climbing. Computed from the same rows rather than stored: a
  // remembered rank would go stale the moment a score was corrected and
  // grading re-ran, and grading is deliberately idempotent.
  const latestWeek = results.reduce((high, row) => Math.max(high, row.week), 0);
  const previousRanks = rankOf(results.filter((row) => row.week < latestWeek));

  const rows: StandingRow[] = rank(byUser).map((entry) => {
    const before = previousRanks.get(entry.userId);
    return {
      ...entry,
      username: nameById.get(entry.userId) ?? 'Someone',
      movement: before === undefined ? null : before - entry.rank,
    };
  });

  return rows;
}

type Tally = Omit<StandingRow, 'username' | 'rank' | 'movement'>;

/**
 * Order and place a set of tallies.
 *
 * Ties share a rank and consume the places behind them, matching how a week is
 * ranked. Pulled out of loadSeasonStandings because the same ordering has to
 * be applied twice — once to the season, once to the season minus its last
 * week — and two copies would be two chances to rank them differently.
 */
function rank(byUser: Map<string, Tally>): (Tally & { rank: number })[] {
  const sorted = [...byUser.values()].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      b.weeklyWins - a.weeklyWins ||
      a.userId.localeCompare(b.userId),
  );

  const placed: (Tally & { rank: number })[] = [];
  let place = 0;
  let previousKey: string | null = null;

  sorted.forEach((entry, index) => {
    const key = `${entry.totalPoints}:${entry.weeklyWins}`;
    if (key !== previousKey) {
      place = index + 1;
      previousKey = key;
    }
    placed.push({ ...entry, rank: place });
  });

  return placed;
}

/** Rank by user id, for a subset of the season's results. */
function rankOf(results: readonly ResultRow[]): Map<string, number> {
  if (results.length === 0) return new Map();
  return new Map(rank(tally(results)).map((entry) => [entry.userId, entry.rank]));
}

/** Fold weekly results into one running total per person. */
function tally(results: readonly ResultRow[]): Map<string, Tally> {
  const byUser = new Map<string, Tally>();

  for (const row of results) {
    const entry =
      byUser.get(row.user_id) ??
      {
        userId: row.user_id,
        totalPoints: 0,
        weeksPlayed: 0,
        weeklyWins: 0,
        correctMl: 0,
        correctSpread: 0,
        correctTotals: 0,
        bestWeek: 0,
        tdPoints: 0,
      };

    entry.totalPoints += Number(row.total_points);
    entry.weeksPlayed += 1;
    if (row.is_winner) entry.weeklyWins += 1;
    entry.correctMl += row.correct_ml;
    entry.correctSpread += row.correct_spread;
    entry.correctTotals += row.correct_totals;
    entry.bestWeek = Math.max(entry.bestWeek, Number(row.total_points));
    entry.tdPoints += Number(row.td_points) || 0;

    byUser.set(row.user_id, entry);
  }

  return byUser;
}
