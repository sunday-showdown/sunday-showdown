// Shared bet slips.
//
// Somebody places a bet at a sportsbook, enters it here, and it posts into a
// channel as a card their league can tail or fade. No book exposes a public API
// for reading a person's wagers, so this is sharing rather than syncing — see
// the note at the top of lib/sportsbooks.ts.
//
// The slip and the message that carries it are written together. A slip with no
// message is invisible, and a message pointing at a slip that failed to insert
// renders as an empty bubble, so a failure on the second write takes the first
// one back out.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { validateSlip, isFailure, summariseSlip } from '@/lib/bets';
import { findBook } from '@/lib/sportsbooks';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { action } = (payload ?? {}) as Record<string, unknown>;
  const supabase = await createServerSupabase();

  if (action === 'share') {
    const { channelId, leagueId } = payload as Record<string, unknown>;

    // A slip can be logged without being posted. A private bet carries no
    // league, which is what keeps it out of everyone else's view — the read
    // policy on shared_bets admits a league's members, and there is no league.
    const posting = typeof channelId === 'string' && channelId.length > 0;
    if (posting && typeof leagueId !== 'string') {
      return Response.json({ error: 'league is required to post a slip' }, { status: 400 });
    }

    const slip = validateSlip((payload as Record<string, unknown>).slip);
    if (isFailure(slip)) return Response.json({ error: slip.error }, { status: 400 });

    if (!findBook(slip.book)) {
      return Response.json({ error: 'Pick a book from the list.' }, { status: 400 });
    }

    const { data: bet, error: betError } = await supabase
      .from('shared_bets')
      .insert({
        league_id: posting ? (leagueId as string) : null,
        user_id: user.id,
        book: slip.book,
        legs: slip.legs,
        american_odds: slip.americanOdds,
        stake: slip.stake,
        note: slip.note,
      })
      .select('id')
      .single();

    if (betError || !bet) {
      // RLS rejects a slip shared into a league this person is not in.
      return Response.json({ error: 'Could not share that slip.' }, { status: 403 });
    }

    if (posting) {
      const { error: messageError } = await supabase.from('messages').insert({
        channel_id: channelId as string,
        user_id: user.id,
        kind: 'bet_slip',
        bet_id: bet.id,
        body: slip.note,
      });

      if (messageError) {
        // Leave no orphan. A slip meant for a channel only exists to be posted.
        await supabase.from('shared_bets').delete().eq('id', bet.id).eq('user_id', user.id);
        return Response.json({ error: 'Could not post that slip.' }, { status: 403 });
      }
    }

    return Response.json({
      ok: true,
      betId: bet.id,
      summary: summariseSlip(slip.legs, slip.americanOdds),
    });
  }

  if (action === 'stance') {
    const { betId, stance } = payload as Record<string, unknown>;
    if (typeof betId !== 'string') {
      return Response.json({ error: 'betId is required' }, { status: 400 });
    }
    if (stance !== 'tail' && stance !== 'fade' && stance !== null) {
      return Response.json({ error: 'A stance is tail or fade.' }, { status: 400 });
    }

    // Tapping the stance you already hold clears it, so the same two buttons
    // cover taking a side, switching sides and backing out.
    const { data: existing } = await supabase
      .from('bet_tails')
      .select('stance')
      .eq('bet_id', betId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (stance === null || existing?.stance === stance) {
      const { error } = await supabase
        .from('bet_tails')
        .delete()
        .eq('bet_id', betId)
        .eq('user_id', user.id);

      if (error) return Response.json({ error: 'could not update that' }, { status: 500 });
      return Response.json({ ok: true, stance: null });
    }

    const { error } = await supabase
      .from('bet_tails')
      .upsert({ bet_id: betId, user_id: user.id, stance }, { onConflict: 'bet_id,user_id' });

    if (error) return Response.json({ error: 'could not update that' }, { status: 403 });
    return Response.json({ ok: true, stance });
  }

  if (action === 'settle') {
    const { betId, result } = payload as Record<string, unknown>;
    if (typeof betId !== 'string') {
      return Response.json({ error: 'betId is required' }, { status: 400 });
    }
    if (result !== 'win' && result !== 'loss' && result !== 'push' && result !== 'pending') {
      return Response.json({ error: 'unknown result' }, { status: 400 });
    }

    // Self-reported, and only by the person who posted it. Nothing in the
    // league standings depends on this, so an honest answer costs nothing and
    // a dishonest one wins nothing.
    const { error } = await supabase
      .from('shared_bets')
      .update({ result })
      .eq('id', betId)
      .eq('user_id', user.id);

    if (error) return Response.json({ error: 'Could not update that slip.' }, { status: 403 });
    return Response.json({ ok: true, result });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
