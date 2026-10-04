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
}

interface ResultRow {
  user_id: string;
  total_points: number;
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
    .select('user_id, total_points, correct_ml, correct_spread, correct_totals, is_winner, week')
    .eq('league_id', leagueId)
    .eq('season', season)
    .returns<ResultRow[]>();

  if (error) throw new Error(`failed to load standings: ${error.message}`);
  if (!results || results.length === 0) return [];

  const byUser = new Map<string, Omit<StandingRow, 'username' | 'rank'>>();

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
      };

    entry.totalPoints += Number(row.total_points);
    entry.weeksPlayed += 1;
    if (row.is_winner) entry.weeklyWins += 1;
    entry.correctMl += row.correct_ml;
    entry.correctSpread += row.correct_spread;
    entry.correctTotals += row.correct_totals;

    byUser.set(row.user_id, entry);
  }

  const { data: profiles, error: profileError } = await db
    .from('profiles')
    .select('user_id, username')
    .in('user_id', [...byUser.keys()]);

  if (profileError) throw new Error(`failed to load names: ${profileError.message}`);
  const nameById = new Map((profiles ?? []).map((p) => [p.user_id as string, p.username as string]));

  const sorted = [...byUser.values()].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      b.weeklyWins - a.weeklyWins ||
      a.userId.localeCompare(b.userId),
  );

  // Ties share a rank and consume the places behind them, matching how a week
  // is ranked.
  const rows: StandingRow[] = [];
  let rank = 0;
  let previousKey: string | null = null;

  sorted.forEach((entry, index) => {
    const key = `${entry.totalPoints}:${entry.weeklyWins}`;
    if (key !== previousKey) {
      rank = index + 1;
      previousKey = key;
    }
    rows.push({
      ...entry,
      username: nameById.get(entry.userId) ?? 'Someone',
      rank,
    });
  });

  return rows;
}
