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
  playground: 'Playground pot',
};

export interface PotMember {
  userId: string;
  username: string;
  paid: boolean;
}

export interface PotView {
  potId: string | null;
  mode: PotMode;
  buyIn: number;
  confirmed: number;
  projected: number;
  members: PotMember[];
  isOwner: boolean;
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
  league: { id: string; season: number },
  mode: PotMode,
): Promise<PotView> {
  const [{ data: pot }, { data: memberRows }] = await Promise.all([
    db
      .from('pots')
      .select('id, buy_in, confirmed_pool, projected_pool, owner_id')
      .eq('league_id', league.id)
      .eq('season', league.season)
      .eq('competition_type', mode)
      .maybeSingle(),
    db.from('league_members').select('user_id').eq('league_id', league.id),
  ]);

  const memberIds = (memberRows ?? []).map((m) => m.user_id as string);

  const [{ data: profiles }, { data: participants }] = await Promise.all([
    memberIds.length
      ? db.from('profiles').select('user_id, username').in('user_id', memberIds)
      : Promise.resolve({ data: [] as { user_id: string; username: string }[] }),
    pot
      ? db.from('pot_participants').select('user_id, paid').eq('pot_id', pot.id)
      : Promise.resolve({ data: [] as { user_id: string; paid: boolean }[] }),
  ]);

  const paid = new Set(
    (participants ?? []).filter((p) => p.paid).map((p) => p.user_id as string),
  );

  const members: PotMember[] = (profiles ?? [])
    .map((profile) => ({
      userId: profile.user_id as string,
      username: profile.username as string,
      paid: paid.has(profile.user_id as string),
    }))
    // Unpaid first: the list exists to answer "who still owes".
    .sort((a, b) => Number(a.paid) - Number(b.paid) || a.username.localeCompare(b.username));

  return {
    potId: (pot?.id as string) ?? null,
    mode,
    buyIn: Math.round(Number(pot?.buy_in ?? 0)),
    confirmed: Math.round(Number(pot?.confirmed_pool ?? 0)),
    projected: Math.round(Number(pot?.projected_pool ?? 0)),
    members,
    isOwner: pot ? pot.owner_id === userId : false,
  };
}
