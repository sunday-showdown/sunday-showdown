// The board with everybody on it.
//
// Ranks only ever showed one league, which makes a twelve-person app feel like
// a six-person one. This is the same five boards (lib/standings.ts, and the
// component both share) computed across every league at once.
//
// The aggregation itself is in Postgres — see migration 0026. It has to be:
// weekly_results is readable only by members of its own league, so a
// cross-league total cannot be assembled from the client however many queries
// it makes. The function returns totals and names and nothing else.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StandingRow } from './standings';

export interface GlobalRow extends StandingRow {
  avatarUrl: string | null;
  currentStreak: number;
  longestStreak: number;
}

interface GlobalResult {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_points: number | string;
  td_points: number | string;
  weeks_played: number;
  weekly_wins: number;
  best_week: number | string;
  correct_ml: number;
  correct_spread: number;
  correct_totals: number;
  current_streak: number;
  longest_streak: number;
}

/**
 * Everybody, ranked, for one season.
 *
 * Ordering and tie handling are deliberately the same as the league table:
 * points, then weeks won, then a stable fallback, with ties sharing a place.
 * A global board that broke ties differently from the league board would have
 * the same two people in a different order on two screens.
 */
export async function loadGlobalStandings(
  db: SupabaseClient,
  season: number,
): Promise<GlobalRow[]> {
  const { data, error } = await db.rpc('global_standings', { target_season: season });
  if (error) throw new Error(`failed to load global standings: ${error.message}`);

  const rows = ((data ?? []) as GlobalResult[]).map((row) => ({
    userId: row.user_id,
    username: row.username ?? 'Someone',
    avatarUrl: row.avatar_url,
    totalPoints: Number(row.total_points),
    tdPoints: Number(row.td_points),
    weeksPlayed: row.weeks_played,
    weeklyWins: row.weekly_wins,
    bestWeek: Number(row.best_week),
    correctMl: row.correct_ml,
    correctSpread: row.correct_spread,
    correctTotals: row.correct_totals,
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    // There is no "last week" to have moved from on a board that spans leagues
    // with different current weeks, so the arrows stay off rather than being
    // computed from something that does not mean what they imply.
    movement: null as number | null,
    rank: 0,
  }));

  return place(rows);
}

/** Order and number, ties sharing a place and consuming the ones behind them. */
function place(rows: GlobalRow[]): GlobalRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      b.weeklyWins - a.weeklyWins ||
      a.userId.localeCompare(b.userId),
  );

  let current = 0;
  let previousKey: string | null = null;

  return sorted.map((row, index) => {
    const key = `${row.totalPoints}:${row.weeklyWins}`;
    if (key !== previousKey) {
      current = index + 1;
      previousKey = key;
    }
    return { ...row, rank: current };
  });
}
