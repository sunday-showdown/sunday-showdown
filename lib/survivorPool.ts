// The pool, not just your own run.
//
// Survivor was a board of teams and a strip of your past picks. Everything that
// makes the format interesting was missing: how many are left, who went out and
// when, what the room has locked in this week, and what each survivor has
// already spent — which is the thing that decides whether they can take the
// obvious team in week 14.
//
// What may be seen is decided in the database, not here. survivor_picks reveals
// a pick once its game has kicked off, and survivor_week_status (migration
// 0031) answers "has this person picked" without the team. So a hidden pick is
// hidden because nothing came back, not because this module filtered it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isAlive } from './survivor';
import type { SurvivorPickResult } from './types';

export interface PoolEntrant {
  userId: string;
  username: string;
  avatarUrl: string | null;
  isMe: boolean;
  alive: boolean;
  /** The week they went out, for the ones who did. */
  outWeek: number | null;
  /** Weeks they have survived so far. */
  survived: number;
  /** This week: locked in, and the team when it may be shown. */
  pickedThisWeek: boolean;
  thisWeekTeam: string | null;
  /** Every team they have spent, oldest first. They may never reuse one. */
  usedTeams: { week: number; team: string; result: SurvivorPickResult }[];
}

export interface PoolBoard {
  entrants: PoolEntrant[];
  aliveCount: number;
  outCount: number;
  /** How many of the living have a pick in for this week. */
  lockedIn: number;
  /** Teams nobody still alive can use again, for the "who has what left" view. */
  me: PoolEntrant | null;
}

interface StatusRow {
  user_id: string;
  has_picked: boolean;
  team_abbr: string | null;
}

/**
 * The whole pool for one week.
 *
 * Three queries regardless of how many entrants: the week's status, the full
 * pick history, and the names.
 */
export async function loadPoolBoard(
  db: SupabaseClient,
  userId: string,
  poolId: string,
  week: number,
): Promise<PoolBoard> {
  const [{ data: status }, { data: history }] = await Promise.all([
    db.rpc('survivor_week_status', { target_pool: poolId, target_week: week }),
    db
      .from('survivor_picks')
      .select('user_id, week, team_abbr, result')
      .eq('pool_id', poolId)
      .order('week', { ascending: true }),
  ]);

  const rows = (status ?? []) as StatusRow[];
  if (rows.length === 0) {
    return { entrants: [], aliveCount: 0, outCount: 0, lockedIn: 0, me: null };
  }

  const { data: profiles } = await db
    .from('profiles')
    .select('user_id, username, avatar_url')
    .in('user_id', rows.map((row) => row.user_id));

  const profileOf = new Map(
    ((profiles ?? []) as { user_id: string; username: string; avatar_url: string | null }[]).map(
      (p) => [p.user_id, p],
    ),
  );

  const picksOf = new Map<string, { week: number; team: string; result: SurvivorPickResult }[]>();
  for (const row of (history ?? []) as Record<string, unknown>[]) {
    const list = picksOf.get(row.user_id as string) ?? [];
    list.push({
      week: row.week as number,
      team: row.team_abbr as string,
      result: row.result as SurvivorPickResult,
    });
    picksOf.set(row.user_id as string, list);
  }

  const entrants: PoolEntrant[] = rows.map((row) => {
    // History only contains weeks whose games have started, so an entrant's
    // spent teams are public by definition and their current pick is not.
    const theirs = (picksOf.get(row.user_id) ?? []).filter((p) => p.week < week);
    const alive = isAlive(theirs.map((p) => p.result));
    const out = theirs.find((p) => p.result === 'eliminated') ?? null;

    return {
      userId: row.user_id,
      username: profileOf.get(row.user_id)?.username ?? 'Someone',
      avatarUrl: profileOf.get(row.user_id)?.avatar_url ?? null,
      isMe: row.user_id === userId,
      alive,
      outWeek: out?.week ?? null,
      survived: theirs.filter((p) => p.result === 'survived' || p.result === 'push').length,
      pickedThisWeek: row.has_picked,
      thisWeekTeam: row.team_abbr,
      usedTeams: theirs,
    };
  });

  // The living first, longest run at the top, then the fallen in the order they
  // fell — which is the order a pool talks about itself in.
  entrants.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.alive) return b.survived - a.survived || a.username.localeCompare(b.username);
    return (b.outWeek ?? 0) - (a.outWeek ?? 0) || a.username.localeCompare(b.username);
  });

  const living = entrants.filter((e) => e.alive);

  return {
    entrants,
    aliveCount: living.length,
    outCount: entrants.length - living.length,
    lockedIn: living.filter((e) => e.pickedThisWeek).length,
    me: entrants.find((e) => e.isMe) ?? null,
  };
}

/** Every NFL team, so "what is left" can be shown as a real remainder. */
export const ALL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WSH',
] as const;

/** What an entrant still has in hand. */
export function teamsLeft(used: readonly { team: string }[]): number {
  const spent = new Set(used.map((u) => u.team));
  return ALL_TEAMS.filter((team) => !spent.has(team)).length;
}
