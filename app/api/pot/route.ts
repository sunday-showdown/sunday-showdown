// Pots: tracking who has paid in, for leagues that play for money.
//
// The app never touches money — it is a shared ledger so nobody has to keep
// the list in their head. Every change is written to pot_audit, which is
// append-only, because who marked what and when is the only record if a
// dispute comes up later.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { isPotMode, POT_LABEL } from '@/lib/pot';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { action } = (body ?? {}) as Record<string, unknown>;
  const supabase = await createServerSupabase();

  if (action === 'create') {
    const { leagueId, season, buyIn, name, competitionType, competitionId } = body as Record<string, unknown>;
    if (typeof leagueId !== 'string' || typeof season !== 'number') {
      return Response.json({ error: 'league and season are required' }, { status: 400 });
    }
    // Each mode carries its own pot. Defaulting to pick'em keeps a client that
    // predates the change working rather than silently creating the wrong one.
    const mode = isPotMode(competitionType) ? competitionType : 'pickem';

    const amount = Number(buyIn);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000) {
      return Response.json({ error: 'That buy-in does not look right.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('pots')
      .insert({
        name: typeof name === 'string' && name.trim() ? name.trim() : POT_LABEL[mode],
        competition_type: mode,
        competition_id: typeof competitionId === 'string' ? competitionId : null,
        league_id: leagueId,
        owner_id: user.id,
        season,
        buy_in: amount,
        status: 'open',
      })
      .select('id')
      .single();

    if (error || !data) {
      // The unique index in migration 0013 is what rejects a second pot for the
      // same mode, which is a race two people starting one at once can lose.
      let lookup = supabase
        .from('pots')
        .select('id')
        .eq('season', season)
        .eq('competition_type', mode);

      lookup =
        typeof competitionId === 'string'
          ? lookup.eq('competition_id', competitionId)
          : lookup.eq('league_id', leagueId).is('competition_id', null);

      const { data: existing } = await lookup.maybeSingle();

      if (existing) return Response.json({ ok: true, potId: existing.id, existed: true });
      return Response.json({ error: 'could not create that pot' }, { status: 500 });
    }
    return Response.json({ ok: true, potId: data.id });
  }

  if (action === 'setPaid') {
    const { potId, targetUserId, paid } = body as Record<string, unknown>;
    if (typeof potId !== 'string' || typeof targetUserId !== 'string') {
      return Response.json({ error: 'pot and member are required' }, { status: 400 });
    }

    const isPaid = paid === true;
    const now = new Date().toISOString();

    const { error } = await supabase.from('pot_participants').upsert(
      {
        pot_id: potId,
        user_id: targetUserId,
        paid: isPaid,
        // The check constraint requires these to move together.
        paid_at: isPaid ? now : null,
      },
      { onConflict: 'pot_id,user_id' },
    );

    if (error) {
      // RLS permits this only for the pot's owner.
      return Response.json({ error: 'could not update that entry' }, { status: 403 });
    }

    await supabase.from('pot_audit').insert({
      pot_id: potId,
      actor_id: user.id,
      action: isPaid ? 'marked_paid' : 'marked_unpaid',
      target_user_id: targetUserId,
      new_value: { paid: isPaid },
    });

    await refreshTotals(supabase, potId);
    return Response.json({ ok: true });
  }

  if (action === 'claim') {
    const { potId, claimed } = body as Record<string, unknown>;
    if (typeof potId !== 'string') {
      return Response.json({ error: 'pot is required' }, { status: 400 });
    }

    // Saying you have paid, which is not the same as having been confirmed. The
    // trigger in migration 0018 is what stops this setting `paid` — see the note
    // there about why that rule lives in the database.
    const { error } = await supabase.from('pot_participants').upsert(
      {
        pot_id: potId,
        user_id: user.id,
        claimed_at: claimed === false ? null : new Date().toISOString(),
      },
      { onConflict: 'pot_id,user_id' },
    );

    if (error) {
      return Response.json({ error: 'Could not record that.' }, { status: 403 });
    }

    await supabase.from('pot_audit').insert({
      pot_id: potId,
      actor_id: user.id,
      action: claimed === false ? 'withdrew_claim' : 'claimed_paid',
      target_user_id: user.id,
      new_value: { claimed: claimed !== false },
    });

    await refreshTotals(supabase, potId);
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}

/** Recount the pot from its participants rather than incrementing. */
async function refreshTotals(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  potId: string,
): Promise<void> {
  const { data: pot } = await supabase.from('pots').select('buy_in').eq('id', potId).maybeSingle();
  const { data: participants } = await supabase
    .from('pot_participants')
    .select('paid')
    .eq('pot_id', potId);

  if (!pot || !participants) return;

  const buyIn = Number(pot.buy_in);
  const paidCount = participants.filter((p) => p.paid).length;

  await supabase
    .from('pots')
    .update({
      total_participants: participants.length,
      paid_count: paidCount,
      confirmed_pool: buyIn * paidCount,
      projected_pool: buyIn * participants.length,
    })
    .eq('id', potId);
}
