// The home dashboard.
//
// Home used to render `leagues[0]` and nothing else, so a second league was
// invisible from the screen the app opens on. This loads a line for every
// league somebody is in — where their card stands, where they sit in the table,
// and whether anyone has said anything — so the first screen answers "what do I
// need to do" across all of them rather than one.
//
// Written as a fixed number of queries rather than a loop over leagues. Six
// round trips for one league and six for ten; a per-league loop would have been
// the N+1 pattern this codebase has already been bitten by twice.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMyLeagues, type LeagueSummary } from './week';

export interface LeagueCard {
  league: LeagueSummary;
  /** Null when the week has not opened yet. */
  challengeId: string | null;
  lockTime: string | null;
  picked: number;
  slate: number;
  rank: number | null;
  fieldSize: number;
  points: number;
  unread: number;
}

export interface Dashboard {
  cards: LeagueCard[];
  liveGames: {
    id: string;
    home_abbr: string;
    away_abbr: string;
    home_score: number | null;
    away_score: number | null;
  }[];
}

export async function loadDashboard(
  db: SupabaseClient,
  userId: string,
): Promise<{ leagues: LeagueSummary[]; dashboard: Dashboard }> {
  const leagues = await loadMyLeagues(db, userId);
  if (leagues.length === 0) {
    return { leagues, dashboard: { cards: [], liveGames: [] } };
  }

  const leagueIds = leagues.map((l) => l.id);
  const seasons = [...new Set(leagues.map((l) => l.season))];

  const [{ data: challenges }, { data: results }, { data: unreadRows }, { data: channels }] =
    await Promise.all([
      db
        .from('pickem_challenges')
        .select('id, league_id, season, week, lock_time')
        .in('league_id', leagueIds),
      db
        .from('weekly_results')
        .select('league_id, user_id, total_points')
        .in('league_id', leagueIds),
      db.rpc('channel_unread_counts'),
      db.from('channels').select('id, league_id').in('league_id', leagueIds),
    ]);

  // The contest for each league's current week, which is the only one home
  // cares about.
  const contestOf = new Map<string, { id: string; lock_time: string; season: number; week: number }>();
  for (const row of (challenges ?? []) as Record<string, unknown>[]) {
    const league = leagues.find((l) => l.id === row.league_id);
    if (!league || row.week !== league.current_week || row.season !== league.season) continue;
    contestOf.set(league.id, {
      id: row.id as string,
      lock_time: row.lock_time as string,
      season: row.season as number,
      week: row.week as number,
    });
  }

  const challengeIds = [...contestOf.values()].map((c) => c.id);

  const [{ data: myPicks }, { data: games }] = await Promise.all([
    challengeIds.length
      ? db.from('picks').select('challenge_id').eq('user_id', userId).in('challenge_id', challengeIds)
      : Promise.resolve({ data: [] as { challenge_id: string }[] }),
    db
      .from('nfl_games')
      .select('id, season, week, home_abbr, away_abbr, home_score, away_score, status')
      .in('season', seasons),
  ]);

  const pickedPer = new Map<string, number>();
  for (const row of (myPicks ?? []) as { challenge_id: string }[]) {
    pickedPer.set(row.challenge_id, (pickedPer.get(row.challenge_id) ?? 0) + 1);
  }

  const gameRows = (games ?? []) as Record<string, unknown>[];
  const slateOf = new Map<string, number>();
  for (const game of gameRows) {
    const key = `${game.season}:${game.week}`;
    slateOf.set(key, (slateOf.get(key) ?? 0) + 1);
  }

  // Points per person per league, then my place in each.
  const pointsPer = new Map<string, Map<string, number>>();
  for (const row of (results ?? []) as Record<string, unknown>[]) {
    const leagueId = row.league_id as string;
    const table = pointsPer.get(leagueId) ?? new Map<string, number>();
    const user = row.user_id as string;
    table.set(user, (table.get(user) ?? 0) + Number(row.total_points));
    pointsPer.set(leagueId, table);
  }

  const unread = new Map<string, number>(
    ((unreadRows ?? []) as { channel_id: string; unread: number }[]).map((r) => [
      r.channel_id,
      Number(r.unread) || 0,
    ]),
  );
  const unreadPerLeague = new Map<string, number>();
  for (const row of (channels ?? []) as { id: string; league_id: string | null }[]) {
    if (!row.league_id) continue;
    const count = unread.get(row.id) ?? 0;
    if (count > 0) {
      unreadPerLeague.set(row.league_id, (unreadPerLeague.get(row.league_id) ?? 0) + count);
    }
  }

  const cards: LeagueCard[] = leagues.map((league) => {
    const contest = contestOf.get(league.id) ?? null;
    const table = pointsPer.get(league.id);
    const standing = table ? placeIn(table, userId) : null;

    return {
      league,
      challengeId: contest?.id ?? null,
      lockTime: contest?.lock_time ?? null,
      picked: contest ? (pickedPer.get(contest.id) ?? 0) : 0,
      slate: slateOf.get(`${league.season}:${league.current_week}`) ?? 0,
      rank: standing?.rank ?? null,
      fieldSize: table?.size ?? 0,
      points: standing?.points ?? 0,
      unread: unreadPerLeague.get(league.id) ?? 0,
    };
  });

  const liveGames = gameRows
    .filter((g) => g.status === 'in_progress')
    .map((g) => ({
      id: g.id as string,
      home_abbr: g.home_abbr as string,
      away_abbr: g.away_abbr as string,
      home_score: (g.home_score as number) ?? null,
      away_score: (g.away_score as number) ?? null,
    }));

  return { leagues, dashboard: { cards, liveGames } };
}

/**
 * Where one person sits in a points table.
 *
 * Ties share a place, matching lib/standings.ts — a card that said 3rd while
 * the table said joint 2nd would be the app disagreeing with itself.
 */
function placeIn(table: Map<string, number>, userId: string): { rank: number; points: number } | null {
  const mine = table.get(userId);
  if (mine === undefined) return null;

  let ahead = 0;
  for (const points of table.values()) {
    if (points > mine) ahead += 1;
  }
  return { rank: ahead + 1, points: mine };
}
