// What you are actually playing, right now, everywhere.
//
// Home listed the modes as a grid of links — the same nine tiles whether you
// were in a survivor pool or had never opened one. So somebody in a pool had no
// way of knowing from the first screen, and the only way to find out you were
// eliminated was to go looking. A hub that cannot tell you what you are in is a
// menu, not a hub.
//
// This answers "what am I in and what does it need from me" across every league
// and pool at once, in a fixed number of queries. Ordering is by urgency rather
// than by mode, because the point of the strip is the thing that is about to
// close without you.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ModeKind = 'pickem' | 'survivor' | 'td' | 'h2h' | 'playground' | 'pot';

export type ModeTone = 'urgent' | 'live' | 'ok' | 'out' | 'idle';

export interface ActiveMode {
  key: string;
  kind: ModeKind;
  /** The mode, then what instance of it: "Survivor · Sunday Boys". */
  title: string;
  scope: string | null;
  /** Where it stands. */
  status: string;
  /** What it wants from you, or null when it wants nothing. */
  todo: string | null;
  tone: ModeTone;
  href: string;
  /** A count worth a badge: unanswered challenges, say. */
  badge: number | null;
  icon: string;
}

/**
 * Sorted so the top of the list is the thing with a deadline.
 *
 * Urgency first, then anything live, then the rest. The tiebreak goes all the
 * way down to the key rather than stopping at the title, because two leagues
 * produce two rows both titled "Pick'em" — and a tie there would leave their
 * order down to whichever query returned first, so the strip would reshuffle
 * itself between renders.
 */
const TONE_ORDER: Record<ModeTone, number> = { urgent: 0, live: 1, ok: 2, out: 3, idle: 4 };

/**
 * How many of these are actually waiting on you.
 *
 * Counted from the tone, not from `todo`: TD Scorer always has something you
 * could do and is never urgent, so counting every suggestion would have Home
 * announcing "3 things need you" on a morning when nothing did — and a banner
 * that cries wolf is one people stop reading.
 */
export function urgentCount(modes: readonly ActiveMode[]): number {
  return modes.filter((mode) => mode.tone === 'urgent').length;
}

export function sortModes(modes: readonly ActiveMode[]): ActiveMode[] {
  return [...modes].sort((a, b) => {
    const byTone = TONE_ORDER[a.tone] - TONE_ORDER[b.tone];
    if (byTone !== 0) return byTone;

    const byTitle = a.title.localeCompare(b.title);
    if (byTitle !== 0) return byTitle;

    const byScope = (a.scope ?? '').localeCompare(b.scope ?? '');
    return byScope !== 0 ? byScope : a.key.localeCompare(b.key);
  });
}

export interface ModesInput {
  week: number;
  /** Per league: name, my card progress, whether it has locked. */
  cards: readonly {
    leagueId: string;
    leagueName: string;
    picked: number;
    slate: number;
    locked: boolean;
    tdPicks: number;
  }[];
  pools: readonly {
    poolId: string;
    name: string;
    aliveCount: number;
    memberCount: number;
    status: string;
    /** My own standing: eliminated, or whether this week's pick is in. */
    eliminated: boolean;
    pickedThisWeek: boolean;
  }[];
  duels: { incoming: number; live: number };
  playground: readonly { leagueName: string | null; published: boolean }[];
  owed: readonly { potId: string; mode: string; leagueName: string | null; amount: number; claimed: boolean }[];
}

/**
 * Build the strip.
 *
 * A pure function so the ordering and the copy are testable without a database,
 * and so the rules about what counts as urgent live in one place rather than
 * being spread through JSX.
 */
export function buildActiveModes(input: ModesInput): ActiveMode[] {
  const modes: ActiveMode[] = [];

  for (const card of input.cards) {
    if (card.slate === 0) continue;

    const complete = card.picked >= card.slate;
    modes.push({
      key: `pickem:${card.leagueId}`,
      kind: 'pickem',
      title: "Pick'em",
      scope: card.leagueName,
      status: card.locked
        ? complete
          ? `Locked · ${card.picked} in`
          : `Locked · ${card.picked} of ${card.slate}`
        : `${card.picked} of ${card.slate} in`,
      todo: card.locked || complete ? null : `${card.slate - card.picked} to go`,
      tone: card.locked ? (complete ? 'live' : 'out') : complete ? 'ok' : 'urgent',
      href: '/picks',
      badge: null,
      icon: '🏈',
    });

    if (card.tdPicks > 0 || !card.locked) {
      modes.push({
        key: `td:${card.leagueId}`,
        kind: 'td',
        title: 'TD Scorer',
        scope: card.leagueName,
        status: card.tdPicks > 0 ? `${card.tdPicks} scorer${card.tdPicks === 1 ? '' : 's'} called` : 'Nothing called',
        todo: card.locked || card.tdPicks > 0 ? null : 'Call the end zone',
        // Never urgent: TD Scorer is optional, and a board of its own. Treating
        // it as a chore would make the strip cry wolf.
        tone: card.tdPicks > 0 ? 'ok' : 'idle',
        href: '/td',
        badge: null,
        icon: '🎯',
      });
    }
  }

  for (const pool of input.pools) {
    const done = pool.status === 'completed' || pool.status === 'cancelled';

    modes.push({
      key: `survivor:${pool.poolId}`,
      kind: 'survivor',
      title: 'Survivor',
      scope: pool.name,
      status: pool.eliminated
        ? 'Eliminated'
        : done
          ? 'Finished'
          : `Alive · ${pool.aliveCount} of ${pool.memberCount} left`,
      todo: pool.eliminated || done || pool.pickedThisWeek ? null : `Week ${input.week} pick not in`,
      tone: pool.eliminated ? 'out' : done ? 'idle' : pool.pickedThisWeek ? 'ok' : 'urgent',
      href: '/survivor',
      badge: null,
      icon: '🛡️',
    });
  }

  if (input.duels.incoming > 0) {
    modes.push({
      key: 'h2h:incoming',
      kind: 'h2h',
      title: 'Duels',
      scope: 'Called out',
      status: `${input.duels.incoming} waiting on you`,
      todo: 'Answer the challenge',
      tone: 'urgent',
      href: '/h2h',
      badge: input.duels.incoming,
      icon: '⚔️',
    });
  } else if (input.duels.live > 0) {
    modes.push({
      key: 'h2h:live',
      kind: 'h2h',
      title: 'Duels',
      scope: 'In the arena',
      status: `${input.duels.live} fight${input.duels.live === 1 ? '' : 's'} on`,
      todo: null,
      tone: 'live',
      href: '/h2h',
      badge: null,
      icon: '⚔️',
    });
  }

  for (const [index, card] of input.playground.entries()) {
    modes.push({
      key: `playground:${index}`,
      kind: 'playground',
      title: 'Playground',
      scope: card.leagueName,
      status: card.published ? 'Card published' : 'Draft saved',
      todo: card.published ? null : 'Publish it',
      tone: card.published ? 'ok' : 'idle',
      href: '/playground',
      badge: null,
      icon: '🎲',
    });
  }

  // Money owed is the one thing on this screen that is somebody else waiting on
  // you, so it is always urgent until it is claimed.
  for (const pot of input.owed) {
    modes.push({
      key: `pot:${pot.potId}`,
      kind: 'pot',
      title: 'Buy-in due',
      scope: pot.leagueName ? `${labelFor(pot.mode)} · ${pot.leagueName}` : labelFor(pot.mode),
      status: pot.claimed ? 'Waiting on the owner' : `$${pot.amount.toFixed(2)} unpaid`,
      todo: pot.claimed ? null : 'Pay your share',
      tone: pot.claimed ? 'ok' : 'urgent',
      href: hrefFor(pot.mode),
      badge: null,
      icon: '💰',
    });
  }

  return sortModes(modes);
}

function labelFor(mode: string): string {
  switch (mode) {
    case 'survivor':
      return 'Survivor';
    case 'td':
      return 'TD Scorer';
    case 'h2h':
      return 'Duels';
    case 'playground':
      return 'Playground';
    default:
      return "Pick'em";
  }
}

function hrefFor(mode: string): string {
  switch (mode) {
    case 'survivor':
      return '/survivor';
    case 'td':
      return '/td';
    case 'h2h':
      return '/h2h';
    case 'playground':
      return '/playground';
    default:
      return '/picks';
  }
}

/**
 * Load the strip.
 *
 * Six queries regardless of how many leagues, pools or duels are involved. The
 * card progress is passed in rather than re-read because Home already has it
 * from lib/dashboard.ts, and two queries for the same number is how a screen
 * ends up disagreeing with itself.
 */
export async function loadActiveModes(
  db: SupabaseClient,
  userId: string,
  season: number,
  week: number,
  cards: readonly {
    leagueId: string;
    leagueName: string;
    picked: number;
    slate: number;
    locked: boolean;
  }[],
): Promise<ActiveMode[]> {
  const leagueName = new Map(cards.map((card) => [card.leagueId, card.leagueName]));

  const [
    { data: memberships },
    { data: tdRows },
    { data: duelRows },
    { data: playgroundRows },
    { data: potRows },
  ] = await Promise.all([
    db.from('survivor_members').select('pool_id').eq('user_id', userId),
    db.from('td_picks').select('league_id').eq('user_id', userId).eq('season', season).eq('week', week),
    db
      .from('h2h_challenges')
      .select('id, status, challenger_id, opponent_id')
      .eq('season', season)
      .in('status', ['pending', 'accepted'])
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`),
    db
      .from('playground_cards')
      .select('league_id, is_published')
      .eq('user_id', userId)
      .eq('season', season)
      .eq('week', week),
    db
      .from('pot_participants')
      .select('pot_id, paid, claimed_at, pots(id, competition_type, league_id, buy_in, status)')
      .eq('user_id', userId)
      .eq('paid', false),
  ]);

  const poolIds = ((memberships ?? []) as { pool_id: string }[]).map((row) => row.pool_id);

  const [{ data: poolRows }, { data: pickRows }] = await Promise.all([
    poolIds.length > 0
      ? db
          .from('survivor_pools')
          .select('id, name, status, alive_count, member_count, season')
          .in('id', poolIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    poolIds.length > 0
      ? db
          .from('survivor_picks')
          .select('pool_id, week, result')
          .eq('user_id', userId)
          .eq('season', season)
          .in('pool_id', poolIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const myPicks = (pickRows ?? []) as { pool_id: string; week: number; result: string }[];

  const pools = ((poolRows ?? []) as Record<string, unknown>[])
    .filter((row) => row.season === season)
    .map((row) => {
      const mine = myPicks.filter((pick) => pick.pool_id === row.id);
      return {
        poolId: row.id as string,
        name: row.name as string,
        aliveCount: Number(row.alive_count ?? 0),
        memberCount: Number(row.member_count ?? 0),
        status: row.status as string,
        // One eliminated pick ends a run, which is the whole format.
        eliminated: mine.some((pick) => pick.result === 'eliminated'),
        pickedThisWeek: mine.some((pick) => pick.week === week),
      };
    });

  const tdPerLeague = new Map<string, number>();
  for (const row of (tdRows ?? []) as { league_id: string }[]) {
    tdPerLeague.set(row.league_id, (tdPerLeague.get(row.league_id) ?? 0) + 1);
  }

  const duels = (duelRows ?? []) as { status: string; opponent_id: string }[];

  const owed = ((potRows ?? []) as Record<string, unknown>[])
    .map((row) => {
      const pot = row.pots as Record<string, unknown> | Record<string, unknown>[] | null;
      const resolved = Array.isArray(pot) ? pot[0] : pot;
      if (!resolved) return null;
      // A pot that is settled or abandoned is not a bill.
      if (resolved.status === 'completed' || resolved.status === 'cancelled') return null;

      const leagueId = (resolved.league_id as string) ?? null;
      return {
        potId: resolved.id as string,
        mode: resolved.competition_type as string,
        leagueName: leagueId ? (leagueName.get(leagueId) ?? null) : null,
        amount: Number(resolved.buy_in ?? 0),
        claimed: row.claimed_at !== null && row.claimed_at !== undefined,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null && row.amount > 0);

  return buildActiveModes({
    week,
    cards: cards.map((card) => ({
      ...card,
      tdPicks: tdPerLeague.get(card.leagueId) ?? 0,
    })),
    pools,
    duels: {
      incoming: duels.filter((duel) => duel.status === 'pending' && duel.opponent_id === userId)
        .length,
      live: duels.filter((duel) => duel.status === 'accepted').length,
    },
    playground: ((playgroundRows ?? []) as Record<string, unknown>[]).map((row) => ({
      leagueName: row.league_id ? (leagueName.get(row.league_id as string) ?? null) : null,
      published: Boolean(row.is_published),
    })),
    owed,
  });
}
