// The week, afterwards.
//
// The app was good at the hour before kickoff and had nothing to say on Tuesday
// morning, which is the other half of a pick'em week — you want to know how you
// did, which pick was the one that cost you, and whether anyone passed you.
// Without that the week just stops.
//
// Deliberately read-only and derived: every number here already exists because
// grading wrote it. A recap that recomputed results would be a second scorer,
// and the first time the two disagreed the recap would be the one believed,
// because it is the screen somebody is looking at.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeagueSummary } from './week';
import { ordinal } from './notifications';
import { pointsForOdds } from './odds';
import { MAX_HP } from './battle';

export interface RecapPick {
  gameId: string;
  market: string;
  label: string;
  matchup: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
  odds: number | null;
  result: 'win' | 'loss' | 'push' | 'pending';
  points: number;
  /** What it would have paid, for the ones that did not land. */
  atStake: number;
}

export interface PickSummary {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  points: number;
  /** Decided picks only — a push is neither a hit nor a miss. */
  hitRate: number | null;
  best: RecapPick | null;
  worst: RecapPick | null;
}

/**
 * Fold a card into a line.
 *
 * "Best" is the winning pick that paid most, which is the one worth bragging
 * about. "Worst" is the losing pick that would have paid most — the near miss,
 * not merely a loss, because every card has losses and only one of them stings.
 */
export function summarisePicks(picks: readonly RecapPick[]): PickSummary {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let pending = 0;
  let points = 0;
  let best: RecapPick | null = null;
  let worst: RecapPick | null = null;

  for (const pick of picks) {
    points += pick.points;

    if (pick.result === 'win') {
      wins += 1;
      if (best === null || pick.points > best.points) best = pick;
    } else if (pick.result === 'loss') {
      losses += 1;
      if (worst === null || pick.atStake > worst.atStake) worst = pick;
    } else if (pick.result === 'push') {
      pushes += 1;
    } else {
      pending += 1;
    }
  }

  const decided = wins + losses;

  return {
    wins,
    losses,
    pushes,
    pending,
    points: Math.round(points),
    hitRate: decided > 0 ? wins / decided : null,
    best,
    worst,
  };
}

/**
 * The one sentence at the top.
 *
 * Written from the rank rather than the points, because "4th" is the thing
 * somebody wants and the points are already on the screen beside it.
 */
export function recapHeadline(input: {
  rank: number | null;
  fieldSize: number;
  points: number;
  movement: number | null;
  isWinner: boolean;
}): string {
  const { rank, fieldSize, points, movement, isWinner } = input;

  if (rank === null) return 'You sat this one out.';
  if (isWinner || rank === 1) return `You won the week with ${points}.`;

  const place = `${ordinal(rank)}${fieldSize > 0 ? ` of ${fieldSize}` : ''}`;
  if (movement !== null && movement > 0) {
    return `${place}, and you climbed ${movement} place${movement === 1 ? '' : 's'}.`;
  }
  if (movement !== null && movement < 0) {
    return `${place}, and you slipped ${Math.abs(movement)} place${movement === -1 ? '' : 's'}.`;
  }
  return `${place} with ${points}.`;
}

export interface RecapDuel {
  id: string;
  opponentName: string;
  myPoints: number;
  theirPoints: number;
  won: boolean;
  drew: boolean;
  knockout: boolean;
}

export interface Recap {
  season: number;
  week: number;
  league: LeagueSummary;
  /** False when the week has not been graded, which the screen has to say. */
  graded: boolean;
  picks: RecapPick[];
  summary: PickSummary;
  rank: number | null;
  fieldSize: number;
  movement: number | null;
  isWinner: boolean;
  headline: string;
  /** Who won the week, so a recap is about the league and not only about you. */
  weekWinner: { username: string; points: number } | null;
  tdPoints: number;
  tdHits: { playerName: string; points: number }[];
  survivor: { poolName: string; teamAbbr: string; result: string }[];
  duels: RecapDuel[];
}

/**
 * One week, after the fact.
 *
 * Six queries, none of them per row. Everything is scoped to one league and one
 * week on purpose — a recap that aggregated across leagues would have to explain
 * which card each number came from, which is exactly the confusion this screen
 * exists to remove.
 */
export async function loadRecap(
  db: SupabaseClient,
  userId: string,
  league: LeagueSummary,
  week: number,
): Promise<Recap> {
  const season = league.season;

  const [{ data: pickRows }, { data: results }, { data: tdRows }, { data: duelRows }] =
    await Promise.all([
      db
        .from('picks')
        .select(
          'game_id, market_type, selection, selection_label, contest_line, contest_odds, result, points',
        )
        .eq('user_id', userId)
        .eq('league_id', league.id)
        .eq('season', season)
        .eq('week', week),
      db
        .from('weekly_results')
        .select('user_id, total_points, td_points, rank, is_winner')
        .eq('league_id', league.id)
        .eq('season', season)
        .eq('week', week),
      db
        .from('td_picks')
        .select('result, points, nfl_players(name)')
        .eq('user_id', userId)
        .eq('league_id', league.id)
        .eq('season', season)
        .eq('week', week),
      db
        .from('h2h_challenges')
        .select(
          'id, challenger_id, opponent_id, challenger_score, opponent_score, challenger_damage, opponent_damage, winner_id, status, duration, week',
        )
        .eq('season', season)
        .eq('week', week)
        .eq('status', 'completed')
        .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`),
    ]);

  const gameIds = [...new Set((pickRows ?? []).map((row) => row.game_id as string))];

  const [{ data: games }, { data: profiles }, { data: survivorRows }] = await Promise.all([
    gameIds.length > 0
      ? db
          .from('nfl_games')
          .select('id, home_abbr, away_abbr, home_score, away_score')
          .in('id', gameIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    db
      .from('profiles')
      .select('user_id, username')
      .in('user_id', [
        ...new Set([
          ...((results ?? []).map((row) => row.user_id as string)),
          ...((duelRows ?? []).flatMap((row) => [
            row.challenger_id as string,
            row.opponent_id as string,
          ])),
        ]),
      ]),
    db
      .from('survivor_picks')
      .select('team_abbr, result, pool_id, survivor_pools(name)')
      .eq('user_id', userId)
      .eq('season', season)
      .eq('week', week),
  ]);

  const gameOf = new Map(
    ((games ?? []) as Record<string, unknown>[]).map((row) => [row.id as string, row]),
  );
  const nameOf = new Map(
    ((profiles ?? []) as { user_id: string; username: string }[]).map((row) => [
      row.user_id,
      row.username,
    ]),
  );

  const picks: RecapPick[] = ((pickRows ?? []) as Record<string, unknown>[]).map((row) => {
    const game = gameOf.get(row.game_id as string);
    const odds = (row.contest_odds as number) ?? null;
    const points = Number(row.points ?? 0);
    const result = (row.result as RecapPick['result']) ?? 'pending';

    return {
      gameId: row.game_id as string,
      market: row.market_type as string,
      label: describeFromRow(row, game),
      matchup: game ? `${game.away_abbr} at ${game.home_abbr}` : '',
      homeAbbr: (game?.home_abbr as string) ?? '',
      awayAbbr: (game?.away_abbr as string) ?? '',
      homeScore: (game?.home_score as number) ?? null,
      awayScore: (game?.away_score as number) ?? null,
      odds,
      result,
      points,
      // What it was worth, so a near miss can be ranked by what it cost.
      atStake: result === 'win' ? points : pointsForOdds(odds),
    };
  });

  const myResult = (results ?? []).find((row) => row.user_id === userId) ?? null;
  const summary = summarisePicks(picks);

  const winnerRow = (results ?? []).find((row) => row.is_winner) ?? null;
  const movement = await loadMovement(db, userId, league.id, season, week, results ?? []);

  const rank = myResult ? ((myResult.rank as number) ?? null) : null;
  const isWinner = Boolean(myResult?.is_winner);

  const duels: RecapDuel[] = ((duelRows ?? []) as Record<string, unknown>[]).map((row) => {
    const iAmChallenger = row.challenger_id === userId;
    const theirId = (iAmChallenger ? row.opponent_id : row.challenger_id) as string;

    return {
      id: row.id as string,
      opponentName: nameOf.get(theirId) ?? 'Someone',
      myPoints: Number((iAmChallenger ? row.challenger_score : row.opponent_score) ?? 0),
      theirPoints: Number((iAmChallenger ? row.opponent_score : row.challenger_score) ?? 0),
      won: row.winner_id === userId,
      drew: row.winner_id === null,
      // A full health bar's worth of damage is a knockout; see lib/battle.ts.
      knockout:
        Number(row.challenger_damage ?? 0) >= MAX_HP || Number(row.opponent_damage ?? 0) >= MAX_HP,
    };
  });

  const survivor = ((survivorRows ?? []) as Record<string, unknown>[]).map((row) => {
    const pool = row.survivor_pools as { name?: string } | { name?: string }[] | null;
    const poolName = Array.isArray(pool) ? (pool[0]?.name ?? 'Pool') : (pool?.name ?? 'Pool');
    return {
      poolName,
      teamAbbr: row.team_abbr as string,
      result: row.result as string,
    };
  });

  return {
    season,
    week,
    league,
    // Grading writes weekly_results, so its absence is the honest signal that
    // the week is not in yet — rather than showing a card of zeroes.
    graded: (results ?? []).length > 0,
    picks,
    summary,
    rank,
    fieldSize: (results ?? []).length,
    movement,
    isWinner,
    headline: recapHeadline({
      rank,
      fieldSize: (results ?? []).length,
      points: summary.points,
      movement,
      isWinner,
    }),
    weekWinner: winnerRow
      ? {
          username: nameOf.get(winnerRow.user_id as string) ?? 'Someone',
          points: Math.round(Number(winnerRow.total_points)),
        }
      : null,
    tdPoints: myResult ? Math.round(Number(myResult.td_points ?? 0)) : 0,
    tdHits: ((tdRows ?? []) as Record<string, unknown>[])
      .filter((row) => row.result === 'win')
      .map((row) => {
        // supabase-js types an embedded to-one join as an array; accept both
        // rather than asserting one and being wrong.
        const player = row.nfl_players as { name?: string } | { name?: string }[] | null;
        const name = Array.isArray(player) ? player[0]?.name : player?.name;
        return { playerName: name ?? 'Someone', points: Number(row.points ?? 0) };
      }),
    survivor,
    duels,
  };
}

/**
 * Places gained or lost over the week.
 *
 * Computed from the season table before and after, rather than stored: standings
 * already derive movement the same way (lib/standings.ts) and two stored copies
 * of the same number is how they come to disagree.
 */
async function loadMovement(
  db: SupabaseClient,
  userId: string,
  leagueId: string,
  season: number,
  week: number,
  thisWeek: readonly Record<string, unknown>[],
): Promise<number | null> {
  if (week <= 1 || thisWeek.length === 0) return null;

  const { data: history } = await db
    .from('weekly_results')
    .select('user_id, total_points, week')
    .eq('league_id', leagueId)
    .eq('season', season)
    .lte('week', week);

  if (!history || history.length === 0) return null;

  const placeIn = (upTo: number): number | null => {
    const totals = new Map<string, number>();
    for (const row of history) {
      if ((row.week as number) > upTo) continue;
      const id = row.user_id as string;
      totals.set(id, (totals.get(id) ?? 0) + Number(row.total_points));
    }
    const mine = totals.get(userId);
    if (mine === undefined) return null;

    let ahead = 0;
    for (const points of totals.values()) if (points > mine) ahead += 1;
    return ahead + 1;
  };

  const before = placeIn(week - 1);
  const after = placeIn(week);
  if (before === null || after === null) return null;

  // Positive is a climb, so the sign matches what the word "movement" implies.
  return before - after;
}

/** The stored label if grading wrote one, and a readable fallback if not. */
function describeFromRow(
  row: Record<string, unknown>,
  game: Record<string, unknown> | undefined,
): string {
  const stored = row.selection_label as string | null;
  if (stored) return stored;

  const market = row.market_type as string;
  const selection = row.selection as string;
  const line = row.contest_line === null ? null : Number(row.contest_line);

  if (market === 'total') return `${selection === 'over' ? 'Over' : 'Under'} ${line ?? ''}`.trim();

  const abbr = (selection === 'home' ? game?.home_abbr : game?.away_abbr) as string | undefined;
  if (market === 'moneyline') return `${abbr ?? selection} to win`;
  return `${abbr ?? selection} ${line !== null && line > 0 ? `+${line}` : (line ?? '')}`.trim();
}

