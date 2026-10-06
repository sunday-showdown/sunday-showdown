// One matchup, in full.
//
// The arena card answers "who is winning". This answers "where was it won",
// which is the question anybody actually has about a fight that has finished:
// both cards, week by week, side by side, with the picks that separated them.
//
// Opponent picks are readable only after their game has kicked off — the policy
// in migration 0030, not a filter here — so a duel that has not started yet
// simply returns nothing for the other side, and there is no way for this to
// leak a card early even if it tried to.

import type { SupabaseClient } from '@supabase/supabase-js';
import { playBattle, describeDamage, type Round } from './battle';
import { defaultFighter, type Fighter } from './fighters';
import { pointsForOdds } from './odds';

export interface MatchupPick {
  gameId: string;
  market: string;
  label: string;
  matchup: string;
  awayScore: number | null;
  homeScore: number | null;
  odds: number | null;
  result: 'win' | 'loss' | 'push' | 'pending';
  points: number;
}

export interface MatchupWeek {
  week: number;
  myPoints: number;
  theirPoints: number;
  myDamage: number;
  theirDamage: number;
  verdict: string;
  myPicks: MatchupPick[];
  theirPicks: MatchupPick[];
  /** Their card is hidden until the games it is on have started. */
  theirsHidden: boolean;
}

export interface MatchupSide {
  userId: string;
  username: string;
  avatarUrl: string | null;
  fighter: Fighter;
  hp: number;
  damage: number;
  points: number;
}

export interface Matchup {
  id: string;
  status: string;
  duration: 'week' | 'season';
  season: number;
  week: number;
  leagueName: string | null;
  iAmChallenger: boolean;
  me: MatchupSide;
  them: MatchupSide;
  weeks: MatchupWeek[];
  winnerId: string | null;
  knockoutWeek: number | null;
  /** True once there is nothing left to play. */
  settled: boolean;
}

/**
 * Load one duel and everything behind it.
 *
 * Returns null when the id is unknown or not the caller's to see — the read
 * policy on h2h_challenges already restricts it to the two fighters and the
 * league, so an unauthorised id simply comes back empty.
 */
export async function loadMatchup(
  db: SupabaseClient,
  userId: string,
  duelId: string,
): Promise<Matchup | null> {
  const { data: row } = await db
    .from('h2h_challenges')
    .select(
      'id, status, duration, season, week, league_id, challenger_league_id, opponent_league_id, challenger_id, opponent_id, challenger_score, opponent_score, challenger_damage, opponent_damage, winner_id',
    )
    .eq('id', duelId)
    .maybeSingle();

  if (!row) return null;

  const iAmChallenger = row.challenger_id === userId;
  const theirId = (iAmChallenger ? row.opponent_id : row.challenger_id) as string;

  // Which league each side's card is read from. Without this the cards below
  // merge every league a player is in: somebody in two leagues has two picks on
  // the same game in the same week, and both were being shown as one card with
  // every row doubled. These are the same two columns grading settles on, so
  // the card on screen is the card that was scored.
  const myLeague = (iAmChallenger ? row.challenger_league_id : row.opponent_league_id) ?? row.league_id;
  const theirLeague = (iAmChallenger ? row.opponent_league_id : row.challenger_league_id) ?? row.league_id;

  const [{ data: roundRows }, { data: profiles }, { data: fighterRows }, { data: league }] =
    await Promise.all([
      db
        .from('h2h_rounds')
        .select('week, challenger_points, opponent_points, challenger_damage, opponent_damage')
        .eq('challenge_id', duelId),
      db
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', [row.challenger_id as string, row.opponent_id as string]),
      db.from('fighters').select('*').in('user_id', [row.challenger_id as string, row.opponent_id as string]),
      row.league_id
        ? db.from('leagues').select('name').eq('id', row.league_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const profileOf = new Map(
    ((profiles ?? []) as { user_id: string; username: string; avatar_url: string | null }[]).map(
      (p) => [p.user_id, p],
    ),
  );

  const fighterOf = new Map<string, Fighter>();
  for (const f of (fighterRows ?? []) as Record<string, unknown>[]) {
    fighterOf.set(f.user_id as string, {
      userId: f.user_id as string,
      name: f.name as string,
      archetype: f.archetype as Fighter['archetype'],
      banner: f.banner as Fighter['banner'],
      taunt: (f.taunt as string) ?? null,
      wins: Number(f.wins ?? 0),
      losses: Number(f.losses ?? 0),
      draws: Number(f.draws ?? 0),
    });
  }

  const fighterFor = (id: string) =>
    fighterOf.get(id) ?? defaultFighter(id, profileOf.get(id)?.username ?? 'Challenger');

  const stored: Round[] = ((roundRows ?? []) as Record<string, unknown>[])
    .map((r) => ({
      week: r.week as number,
      challengerPoints: Number(r.challenger_points),
      opponentPoints: Number(r.opponent_points),
      challengerDamage: Number(r.challenger_damage),
      opponentDamage: Number(r.opponent_damage),
    }))
    .sort((a, b) => a.week - b.week);

  // A duel settled before h2h_rounds existed has its scores and damage on the
  // challenge row and no round to read. Rebuilding the single round it must
  // have had keeps every number below — the week scores, the health bars, the
  // verdict — coming from one place rather than from two that can disagree.
  const rounds: Round[] =
    stored.length > 0
      ? stored
      : Number(row.challenger_damage ?? 0) > 0 ||
          Number(row.opponent_damage ?? 0) > 0 ||
          Number(row.challenger_score ?? 0) > 0 ||
          Number(row.opponent_score ?? 0) > 0
        ? [
            {
              week: row.week as number,
              challengerPoints: Number(row.challenger_score ?? 0),
              opponentPoints: Number(row.opponent_score ?? 0),
              challengerDamage: Number(row.challenger_damage ?? 0),
              opponentDamage: Number(row.opponent_damage ?? 0),
            },
          ]
        : [];

  const state = playBattle(rounds);
  const weekNumbers = rounds.length > 0 ? rounds.map((r) => r.week) : [row.week as number];

  // Both cards for every week the duel has touched. Two queries whatever the
  // length of the fight; the policy decides which of theirs come back.
  const [{ data: pickRows }, { data: games }] = await Promise.all([
    db
      .from('picks')
      .select(
        'user_id, league_id, game_id, season, week, market_type, selection, selection_label, contest_line, contest_odds, result, points',
      )
      .in('user_id', [userId, theirId])
      .eq('season', row.season)
      .in('week', weekNumbers),
    db
      .from('nfl_games')
      .select('id, home_abbr, away_abbr, home_score, away_score')
      .eq('season', row.season)
      .in('week', weekNumbers),
  ]);

  const gameOf = new Map(
    ((games ?? []) as Record<string, unknown>[]).map((g) => [g.id as string, g]),
  );

  const toPick = (p: Record<string, unknown>): MatchupPick => {
    const game = gameOf.get(p.game_id as string);
    return {
      gameId: p.game_id as string,
      market: p.market_type as string,
      label: (p.selection_label as string) ?? describe(p, game),
      matchup: game ? `${game.away_abbr} at ${game.home_abbr}` : '',
      awayScore: (game?.away_score as number) ?? null,
      homeScore: (game?.home_score as number) ?? null,
      odds: (p.contest_odds as number) ?? null,
      result: (p.result as MatchupPick['result']) ?? 'pending',
      points: Number(p.points ?? 0),
    };
  };

  const allPicks = (pickRows ?? []) as Record<string, unknown>[];

  const weeks: MatchupWeek[] = weekNumbers
    .map((week) => {
      const round = rounds.find((r) => r.week === week);
      const myPoints = round ? (iAmChallenger ? round.challengerPoints : round.opponentPoints) : 0;
      const theirPoints = round
        ? iAmChallenger
          ? round.opponentPoints
          : round.challengerPoints
        : 0;
      const myDamage = round ? (iAmChallenger ? round.challengerDamage : round.opponentDamage) : 0;
      const theirDamage = round ? (iAmChallenger ? round.opponentDamage : round.challengerDamage) : 0;

      const mine = allPicks
        .filter(
          (p) => p.user_id === userId && p.week === week && inLeague(p, myLeague),
        )
        .map(toPick);
      const theirs = allPicks
        .filter(
          (p) => p.user_id === theirId && p.week === week && inLeague(p, theirLeague),
        )
        .map(toPick);

      return {
        week,
        myPoints,
        theirPoints,
        myDamage,
        theirDamage,
        verdict:
          myDamage > 0
            ? `${describeDamage(myDamage)} — you took the week`
            : theirDamage > 0
              ? `${describeDamage(theirDamage)} against you`
              : round
                ? 'Level. Nobody landed.'
                : 'Not played yet',
        myPicks: sortPicks(mine),
        theirPicks: sortPicks(theirs),
        // Nothing came back for them, but something did for me: their card is
        // still behind the kickoff rule rather than genuinely empty.
        theirsHidden: theirs.length === 0 && mine.length > 0,
      };
    })
    .sort((a, b) => b.week - a.week);

  const sideFor = (id: string, damageTaken: number, damageDealt: number, points: number): MatchupSide => ({
    userId: id,
    username: profileOf.get(id)?.username ?? 'Someone',
    avatarUrl: profileOf.get(id)?.avatar_url ?? null,
    fighter: fighterFor(id),
    hp: Math.max(0, 100 - damageTaken),
    damage: damageDealt,
    points,
  });

  const challengerScore = Number(row.challenger_score ?? 0);
  const opponentScore = Number(row.opponent_score ?? 0);

  return {
    id: row.id as string,
    status: row.status as string,
    duration: row.duration as 'week' | 'season',
    season: row.season as number,
    week: row.week as number,
    leagueName: ((league as { name?: string } | null)?.name as string) ?? null,
    iAmChallenger,
    me: iAmChallenger
      ? sideFor(userId, state.opponentDamage, state.challengerDamage, challengerScore)
      : sideFor(userId, state.challengerDamage, state.opponentDamage, opponentScore),
    them: iAmChallenger
      ? sideFor(theirId, state.challengerDamage, state.opponentDamage, opponentScore)
      : sideFor(theirId, state.opponentDamage, state.challengerDamage, challengerScore),
    weeks,
    winnerId: (row.winner_id as string) ?? null,
    knockoutWeek: state.knockoutWeek,
    settled: row.status === 'completed',
  };
}

/**
 * Whether a pick belongs to the card this side of the duel is scored on.
 *
 * Somebody in two leagues has two picks on the same game in the same week, and
 * without this both were shown as one card with every row doubled. A duel with
 * no recorded league on a side predates the split, and then there is nothing to
 * narrow by.
 */
function inLeague(pick: Record<string, unknown>, leagueId: string | null | undefined): boolean {
  return !leagueId || pick.league_id === leagueId;
}

/** Winners first, then the biggest near misses — the order people read a card in. */
function sortPicks(picks: MatchupPick[]): MatchupPick[] {
  return [...picks].sort((a, b) => {
    const rank = (p: MatchupPick) => (p.result === 'win' ? 0 : p.result === 'pending' ? 1 : 2);
    const byResult = rank(a) - rank(b);
    if (byResult !== 0) return byResult;
    const value = (p: MatchupPick) => (p.result === 'win' ? p.points : pointsForOdds(p.odds));
    return value(b) - value(a);
  });
}

/** The stored label if grading wrote one, and something readable if not. */
function describe(p: Record<string, unknown>, game: Record<string, unknown> | undefined): string {
  const market = p.market_type as string;
  const selection = p.selection as string;
  const line = p.contest_line === null ? null : Number(p.contest_line);

  if (market === 'total') return `${selection === 'over' ? 'Over' : 'Under'} ${line ?? ''}`.trim();
  const abbr = (selection === 'home' ? game?.home_abbr : game?.away_abbr) as string | undefined;
  if (market === 'moneyline') return `${abbr ?? selection} to win`;
  return `${abbr ?? selection} ${line !== null && line > 0 ? `+${line}` : (line ?? '')}`.trim();
}
