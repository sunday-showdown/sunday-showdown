// Loading the data one week of Pick'em needs.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PickemMarket } from './types';

export interface LeagueSummary {
  id: string;
  name: string;
  season: number;
  current_week: number;
  commissioner_id: string;
}

export interface WeekData {
  league: LeagueSummary;
  challenge: {
    id: string;
    season: number;
    week: number;
    enabled_markets: string[];
    lock_time: string;
    lines_frozen_at: string | null;
  } | null;
  games: {
    id: string;
    home_abbr: string;
    away_abbr: string;
    home_logo: string | null;
    away_logo: string | null;
    start_time: string;
    status: string;
    home_score: number | null;
    away_score: number | null;
  }[];
  oddsByGame: Record<
    string,
    { market_type: string; selection: string; line: number | null; american_odds: number | null }[]
  >;
  myPicks: { game_id: string; market_type: PickemMarket; selection: string }[];
}

/** The leagues a user belongs to, commissioner's first. */
export async function loadMyLeagues(
  db: SupabaseClient,
  userId: string,
): Promise<LeagueSummary[]> {
  const { data, error } = await db
    .from('league_members')
    .select('leagues(id, name, season, current_week, commissioner_id)')
    .eq('user_id', userId);

  if (error) throw new Error(`failed to load leagues: ${error.message}`);

  // supabase-js cannot tell this join is to-one, so it types the embedded row
  // as an array even though a single object comes back at runtime. Accept both
  // rather than asserting one and being wrong.
  return (data ?? [])
    .flatMap((row) => {
      const embedded = (row as unknown as { leagues: LeagueSummary | LeagueSummary[] | null })
        .leagues;
      if (!embedded) return [];
      return Array.isArray(embedded) ? embedded : [embedded];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One week of Pick'em for one league.
 *
 * Reads are batched: the slate, its odds and the user's picks are three
 * queries regardless of how many games or players are involved.
 *
 * Frozen lines take precedence over live odds once a contest has locked, so a
 * locked card always shows the numbers it was actually graded against.
 */
export async function loadWeek(
  db: SupabaseClient,
  userId: string,
  league: LeagueSummary,
  week: number,
): Promise<WeekData> {
  const season = league.season;

  const { data: challenge, error: challengeError } = await db
    .from('pickem_challenges')
    .select('id, season, week, enabled_markets, lock_time, lines_frozen_at')
    .eq('league_id', league.id)
    .eq('season', season)
    .eq('week', week)
    .maybeSingle();

  if (challengeError) throw new Error(`failed to load contest: ${challengeError.message}`);

  const { data: games, error: gamesError } = await db
    .from('nfl_games')
    .select('id, home_abbr, away_abbr, home_logo, away_logo, start_time, status, home_score, away_score')
    .eq('season', season)
    .eq('week', week)
    .order('start_time', { ascending: true });

  if (gamesError) throw new Error(`failed to load games: ${gamesError.message}`);

  const oddsByGame: WeekData['oddsByGame'] = {};
  const gameIds = (games ?? []).map((g) => g.id as string);

  if (gameIds.length > 0) {
    if (challenge?.lines_frozen_at) {
      const { data: frozen, error: frozenError } = await db
        .from('contest_lines')
        .select('game_id, market_type, selection, contest_line, contest_odds')
        .eq('challenge_id', challenge.id);

      if (frozenError) throw new Error(`failed to load frozen lines: ${frozenError.message}`);

      for (const row of frozen ?? []) {
        const list = oddsByGame[row.game_id as string] ?? [];
        list.push({
          market_type: row.market_type as string,
          selection: row.selection as string,
          line: row.contest_line === null ? null : Number(row.contest_line),
          american_odds: row.contest_odds as number | null,
        });
        oddsByGame[row.game_id as string] = list;
      }
    } else {
      const { data: live, error: liveError } = await db
        .from('nfl_game_odds')
        .select('game_id, market_type, selection, line, american_odds')
        .in('game_id', gameIds)
        .eq('is_active', true);

      if (liveError) throw new Error(`failed to load odds: ${liveError.message}`);

      for (const row of live ?? []) {
        const list = oddsByGame[row.game_id as string] ?? [];
        list.push({
          market_type: row.market_type as string,
          selection: row.selection as string,
          line: row.line === null ? null : Number(row.line),
          american_odds: row.american_odds as number | null,
        });
        oddsByGame[row.game_id as string] = list;
      }
    }
  }

  let myPicks: WeekData['myPicks'] = [];
  if (challenge) {
    const { data: picks, error: picksError } = await db
      .from('picks')
      .select('game_id, market_type, selection')
      .eq('user_id', userId)
      .eq('challenge_id', challenge.id);

    if (picksError) throw new Error(`failed to load picks: ${picksError.message}`);
    myPicks = (picks ?? []) as WeekData['myPicks'];
  }

  return {
    league,
    challenge: challenge as WeekData['challenge'],
    games: (games ?? []) as WeekData['games'],
    oddsByGame,
    myPicks,
  };
}
