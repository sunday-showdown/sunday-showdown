// Loading duels for the arena.
//
// The H2H screen used to read league_members and show a row per league mate.
// That is no longer the shape of the feature: a duel can be against any friend,
// it can run for a week or a season, and it is drawn as a fight rather than as
// a comparison. So this loads the fights, the fighters in them and the people
// you are allowed to start one with, in a fixed number of queries.

import type { SupabaseClient } from '@supabase/supabase-js';
import { playBattle, type Round } from './battle';
import { defaultFighter, type Fighter } from './fighters';
import { LAST_REGULAR_WEEK } from './h2h';

export type DuelStatus = 'pending' | 'accepted' | 'completed' | 'declined' | 'cancelled' | 'expired';

export interface Duel {
  id: string;
  status: DuelStatus;
  duration: 'week' | 'season';
  season: number;
  week: number;
  /** Null for a duel between friends in different leagues. */
  leagueId: string | null;
  leagueName: string | null;
  /** True when I sent it, which decides whether I can withdraw or must answer. */
  iAmChallenger: boolean;
  /** Always from my side: me first, them second. */
  me: DuelSide;
  them: DuelSide;
  rounds: DuelRound[];
  /** Null while the fight is unresolved. */
  winnerId: string | null;
  knockoutWeek: number | null;
  /** Set once the recipient has seen the challenge animation. */
  seenAt: string | null;
  createdAt: string;
}

export interface DuelSide {
  userId: string;
  /** The account behind the fighter: a fighter name alone leaves you guessing. */
  username: string;
  fighter: Fighter;
  avatarUrl: string | null;
  hp: number;
  damage: number;
  points: number;
}

export interface DuelRound {
  week: number;
  myPoints: number;
  theirPoints: number;
  myDamage: number;
  theirDamage: number;
}

export interface Opponent {
  userId: string;
  username: string;
  avatarUrl: string | null;
  fighter: Fighter;
  /** Why they are listed: a league mate, a friend, or both. */
  viaLeague: string | null;
  isFriend: boolean;
  /** Lifetime duel record against me, from the fights loaded here. */
  myWins: number;
  theirWins: number;
  /** An open duel already exists, so the button has to say so. */
  openDuel: boolean;
}

export interface DuelsView {
  duels: Duel[];
  /** Unanswered challenges aimed at me, newest first — the inbox. */
  incoming: Duel[];
  /** Accepted and unresolved. */
  live: Duel[];
  settled: Duel[];
  opponents: Opponent[];
  myFighter: Fighter;
}

interface ChallengeRow {
  id: string;
  status: DuelStatus;
  duration: 'week' | 'season';
  season: number;
  week: number;
  league_id: string | null;
  challenger_id: string;
  opponent_id: string;
  challenger_score: number | null;
  opponent_score: number | null;
  challenger_damage: number | null;
  opponent_damage: number | null;
  winner_id: string | null;
  seen_at: string | null;
  created_at: string;
}

/**
 * Everything the arena needs for one person in one season.
 *
 * Five queries regardless of how many duels or friends are involved. An earlier
 * version of this screen did a lookup per league mate, which is the N+1 pattern
 * this codebase has been bitten by before.
 */
export async function loadDuels(
  db: SupabaseClient,
  userId: string,
  season: number,
  leagues: readonly { id: string; name: string }[],
): Promise<DuelsView> {
  const leagueIds = leagues.map((l) => l.id);

  const [{ data: rows }, { data: follows }, { data: members }] = await Promise.all([
    db
      .from('h2h_challenges')
      .select(
        'id, status, duration, season, week, league_id, challenger_id, opponent_id, challenger_score, opponent_score, challenger_damage, opponent_damage, winner_id, seen_at, created_at',
      )
      .eq('season', season)
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(80),
    db.from('follows').select('follower_id, following_id'),
    leagueIds.length > 0
      ? db.from('league_members').select('user_id, league_id').in('league_id', leagueIds)
      : Promise.resolve({ data: [] as { user_id: string; league_id: string }[] }),
  ]);

  const challenges = (rows ?? []) as ChallengeRow[];

  // Mutual follows only. A one-way follow is not consent to be challenged, and
  // the insert policy enforces the same rule in the database.
  const iFollow = new Set<string>();
  const followsMe = new Set<string>();
  for (const row of (follows ?? []) as { follower_id: string; following_id: string }[]) {
    if (row.follower_id === userId) iFollow.add(row.following_id);
    if (row.following_id === userId) followsMe.add(row.follower_id);
  }
  const friends = new Set([...iFollow].filter((id) => followsMe.has(id)));

  const mateLeague = new Map<string, string>();
  for (const row of (members ?? []) as { user_id: string; league_id: string }[]) {
    if (row.user_id === userId) continue;
    if (!mateLeague.has(row.user_id)) mateLeague.set(row.user_id, row.league_id);
  }

  const people = new Set<string>([userId, ...friends, ...mateLeague.keys()]);
  for (const row of challenges) {
    people.add(row.challenger_id);
    people.add(row.opponent_id);
  }

  const [{ data: profiles }, { data: fighterRows }, { data: roundRows }] = await Promise.all([
    db.from('profiles').select('user_id, username, avatar_url').in('user_id', [...people]),
    db.from('fighters').select('*').in('user_id', [...people]),
    challenges.length > 0
      ? db
          .from('h2h_rounds')
          .select('challenge_id, week, challenger_points, opponent_points, challenger_damage, opponent_damage')
          .in('challenge_id', challenges.map((c) => c.id))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const profileOf = new Map(
    ((profiles ?? []) as { user_id: string; username: string; avatar_url: string | null }[]).map(
      (row) => [row.user_id, row],
    ),
  );

  const fighterOf = new Map<string, Fighter>();
  for (const row of (fighterRows ?? []) as Record<string, unknown>[]) {
    fighterOf.set(row.user_id as string, {
      userId: row.user_id as string,
      name: row.name as string,
      archetype: row.archetype as Fighter['archetype'],
      banner: row.banner as Fighter['banner'],
      taunt: (row.taunt as string) ?? null,
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      draws: Number(row.draws ?? 0),
    });
  }

  // Everybody has a fighter whether or not they built one, so the arena never
  // has an empty plinth in it.
  const fighterFor = (id: string): Fighter =>
    fighterOf.get(id) ?? defaultFighter(id, profileOf.get(id)?.username ?? 'Challenger');

  const roundsOf = new Map<string, Round[]>();
  for (const row of (roundRows ?? []) as Record<string, unknown>[]) {
    const list = roundsOf.get(row.challenge_id as string) ?? [];
    list.push({
      week: row.week as number,
      challengerPoints: Number(row.challenger_points),
      opponentPoints: Number(row.opponent_points),
      challengerDamage: Number(row.challenger_damage),
      opponentDamage: Number(row.opponent_damage),
    });
    roundsOf.set(row.challenge_id as string, list);
  }

  const leagueName = new Map(leagues.map((l) => [l.id, l.name]));

  const duels: Duel[] = challenges.map((row) => {
    const iAmChallenger = row.challenger_id === userId;
    const rounds = roundsOf.get(row.id) ?? [];
    const state = playBattle(rounds);

    // Health comes from the replayed rounds when there are any, and from the
    // stored totals otherwise — a weekly duel settled before h2h_rounds existed
    // still has its damage on the challenge row.
    const challengerDamage = rounds.length > 0 ? state.challengerDamage : Number(row.challenger_damage ?? 0);
    const opponentDamage = rounds.length > 0 ? state.opponentDamage : Number(row.opponent_damage ?? 0);

    const challengerSide: DuelSide = {
      userId: row.challenger_id,
      username: profileOf.get(row.challenger_id)?.username ?? 'Someone',
      fighter: fighterFor(row.challenger_id),
      avatarUrl: profileOf.get(row.challenger_id)?.avatar_url ?? null,
      hp: Math.max(0, 100 - opponentDamage),
      damage: challengerDamage,
      points: Number(row.challenger_score ?? 0),
    };
    const opponentSide: DuelSide = {
      userId: row.opponent_id,
      username: profileOf.get(row.opponent_id)?.username ?? 'Someone',
      fighter: fighterFor(row.opponent_id),
      avatarUrl: profileOf.get(row.opponent_id)?.avatar_url ?? null,
      hp: Math.max(0, 100 - challengerDamage),
      damage: opponentDamage,
      points: Number(row.opponent_score ?? 0),
    };

    return {
      id: row.id,
      status: row.status,
      duration: row.duration,
      season: row.season,
      week: row.week,
      leagueId: row.league_id,
      leagueName: row.league_id ? (leagueName.get(row.league_id) ?? null) : null,
      iAmChallenger,
      me: iAmChallenger ? challengerSide : opponentSide,
      them: iAmChallenger ? opponentSide : challengerSide,
      rounds: rounds
        .sort((a, b) => a.week - b.week)
        .map((round) => ({
          week: round.week,
          myPoints: iAmChallenger ? round.challengerPoints : round.opponentPoints,
          theirPoints: iAmChallenger ? round.opponentPoints : round.challengerPoints,
          myDamage: iAmChallenger ? round.challengerDamage : round.opponentDamage,
          theirDamage: iAmChallenger ? round.opponentDamage : round.challengerDamage,
        })),
      winnerId: row.winner_id,
      knockoutWeek: state.knockoutWeek,
      seenAt: row.seen_at,
      createdAt: row.created_at,
    };
  });

  const incoming = duels.filter((d) => d.status === 'pending' && !d.iAmChallenger);
  const live = duels.filter((d) => d.status === 'accepted' || (d.status === 'pending' && d.iAmChallenger));
  const settled = duels.filter((d) => d.status === 'completed');

  const openAgainst = new Set(
    duels
      .filter((d) => d.status === 'pending' || d.status === 'accepted')
      .map((d) => d.them.userId),
  );

  const candidates = new Set([...friends, ...mateLeague.keys()]);
  const opponents: Opponent[] = [...candidates]
    .map((id) => {
      const settledAgainst = settled.filter((d) => d.them.userId === id);
      const viaLeague = mateLeague.get(id);

      return {
        userId: id,
        username: profileOf.get(id)?.username ?? 'Someone',
        avatarUrl: profileOf.get(id)?.avatar_url ?? null,
        fighter: fighterFor(id),
        viaLeague: viaLeague ? (leagueName.get(viaLeague) ?? null) : null,
        isFriend: friends.has(id),
        myWins: settledAgainst.filter((d) => d.winnerId === userId).length,
        theirWins: settledAgainst.filter((d) => d.winnerId === id).length,
        openDuel: openAgainst.has(id),
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username));

  return {
    duels,
    incoming,
    live,
    settled,
    opponents,
    myFighter: fighterFor(userId),
  };
}

/** How many rounds a season duel has left to play, for the arena's subtitle. */
export function roundsRemaining(duel: Pick<Duel, 'duration' | 'week'>, currentWeek: number): number {
  if (duel.duration !== 'season') return 0;
  return Math.max(0, LAST_REGULAR_WEEK - Math.max(currentWeek, duel.week));
}
