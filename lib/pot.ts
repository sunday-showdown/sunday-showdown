// Pots, per mode.
//
// A pot used to be one league-wide ledger with a page of its own, which was
// wrong in both directions: a league that plays survivor for money and pick'em
// for pride had no way to say so, and a screen called "Pot" told you nothing
// about which game it belonged to. `competition_type` was on the table from the
// start; this makes it the identity, and a unique index per
// (league, season, mode) in migration 0013 enforces it.
//
// The app never moves money. It is a shared record of who has paid in, so
// nobody has to keep the list in their head, and every change is written to
// pot_audit with who made it.

import type { SupabaseClient } from '@supabase/supabase-js';

export const POT_MODES = ['pickem', 'survivor', 'td', 'h2h', 'playground'] as const;
export type PotMode = (typeof POT_MODES)[number];

export function isPotMode(value: unknown): value is PotMode {
  return typeof value === 'string' && (POT_MODES as readonly string[]).includes(value);
}

/** What the pot is called on each mode's screen. */
export const POT_LABEL: Record<PotMode, string> = {
  pickem: "Pick'em pot",
  survivor: 'Survivor pot',
  td: 'TD Scorer pot',
  h2h: 'Head-to-head pot',
  playground: 'Calls pot',
};

export interface PotMember {
  userId: string;
  username: string;
  paid: boolean;
  /** They have said they sent it; the owner has not confirmed yet. */
  claimed: boolean;
}

export interface PotView {
  potId: string | null;
  mode: PotMode;
  buyIn: number;
  confirmed: number;
  projected: number;
  members: PotMember[];
  isOwner: boolean;
  /** This person's own standing in the pot, which is what they came to see. */
  me: { inPot: boolean; paid: boolean; claimed: boolean };
  /** How many people are waiting on the owner to confirm. */
  awaitingConfirmation: number;
}

/**
 * One mode's pot and the league's members beside it.
 *
 * Returns a view with potId null when no pot has been started, rather than
 * null — the panel still has something to render in that case, which is the
 * invitation to start one.
 */
export async function loadPot(
  db: SupabaseClient,
  userId: string,
  /**
   * Where the pot lives. The league is optional: a survivor pool can be started
   * by anybody and invited to by code, so it need not belong to a league at all,
   * and such a pool could not hold a pot while this required one.
   */
  scope: { leagueId: string | null; season: number },
  mode: PotMode,
  /** For a pot that belongs to one pool rather than to the mode in general. */
  competitionId?: string,
): Promise<PotView> {
  let potQuery = db
    .from('pots')
    .select('id, buy_in, confirmed_pool, projected_pool, owner_id')
    .eq('season', scope.season)
    .eq('competition_type', mode);

  potQuery = competitionId
    ? potQuery.eq('competition_id', competitionId)
    : scope.leagueId
      ? potQuery.eq('league_id', scope.leagueId).is('competition_id', null)
      : potQuery.is('league_id', null).is('competition_id', null);

  // Who the pot is collecting from.
  //
  // This used to be the league roster in every case, which is wrong for a pot
  // that belongs to one competition: a survivor pool can contain friends from
  // outside the league and need not contain everybody in it, so the list showed
  // people who owed nothing and omitted people who did.
  const rosterQuery =
    competitionId && mode === 'survivor'
      ? db.from('survivor_members').select('user_id').eq('pool_id', competitionId)
      : scope.leagueId
        ? db.from('league_members').select('user_id').eq('league_id', scope.leagueId)
        : null;

  const [{ data: pot }, roster] = await Promise.all([
    potQuery.maybeSingle(),
    rosterQuery ?? Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);

  const memberRows = roster.data;
  const memberIds = (memberRows ?? []).map((m) => m.user_id as string);

  const [{ data: profiles }, { data: participants }] = await Promise.all([
    memberIds.length
      ? db.from('profiles').select('user_id, username').in('user_id', memberIds)
      : Promise.resolve({ data: [] as { user_id: string; username: string }[] }),
    pot
      ? db.from('pot_participants').select('user_id, paid, claimed_at').eq('pot_id', pot.id)
      : Promise.resolve({ data: [] as { user_id: string; paid: boolean; claimed_at: string | null }[] }),
  ]);

  const entryOf = new Map(
    ((participants ?? []) as { user_id: string; paid: boolean; claimed_at: string | null }[]).map(
      (row) => [row.user_id, row],
    ),
  );

  const members: PotMember[] = (profiles ?? [])
    .map((profile) => {
      const entry = entryOf.get(profile.user_id as string);
      return {
        userId: profile.user_id as string,
        username: profile.username as string,
        paid: Boolean(entry?.paid),
        claimed: Boolean(entry?.claimed_at) && !entry?.paid,
      };
    })
    // Whoever is waiting on the owner comes first, then whoever still owes, then
    // the people already settled. The list exists to answer "what do I do next".
    .sort(
      (a, b) =>
        Number(b.claimed) - Number(a.claimed) ||
        Number(a.paid) - Number(b.paid) ||
        a.username.localeCompare(b.username),
    );

  const mine = entryOf.get(userId);

  return {
    potId: (pot?.id as string) ?? null,
    mode,
    buyIn: Math.round(Number(pot?.buy_in ?? 0)),
    confirmed: Math.round(Number(pot?.confirmed_pool ?? 0)),
    projected: Math.round(Number(pot?.projected_pool ?? 0)),
    members,
    isOwner: pot ? pot.owner_id === userId : false,
    me: {
      inPot: mine !== undefined,
      paid: Boolean(mine?.paid),
      claimed: Boolean(mine?.claimed_at) && !mine?.paid,
    },
    awaitingConfirmation: members.filter((member) => member.claimed).length,
  };
}
