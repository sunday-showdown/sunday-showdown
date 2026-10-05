// Head-to-head challenges.
//
// Creating one is guarded by a unique constraint on
// (challenger, opponent, league, season, week, type), so a double-tap or a
// retrying client cannot spam someone's inbox.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';

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

  const { opponentId, leagueId, week, season } = (body ?? {}) as Record<string, unknown>;

  if (typeof opponentId !== 'string' || !opponentId) {
    return Response.json({ error: 'opponentId is required' }, { status: 400 });
  }
  if (opponentId === user.id) {
    return Response.json({ error: 'You cannot challenge yourself.' }, { status: 400 });
  }
  if (typeof leagueId !== 'string' || !leagueId) {
    return Response.json({ error: 'leagueId is required' }, { status: 400 });
  }
  if (typeof week !== 'number' || typeof season !== 'number') {
    return Response.json({ error: 'week and season are required' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('h2h_challenges').insert({
    challenger_id: user.id,
    opponent_id: opponentId,
    league_id: leagueId,
    challenge_type: 'pickem',
    season,
    week,
    status: 'pending',
  });

  if (error) {
    const duplicate = error.message.includes('duplicate') || error.code === '23505';
    return Response.json(
      { error: duplicate ? 'You have already challenged them this week.' : 'Could not send that challenge.' },
      { status: duplicate ? 409 : 500 },
    );
  }

  return Response.json({ ok: true });
}

/** Accept or decline a challenge sent to you; cancel one you sent. */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { challengeId, action } = (body ?? {}) as Record<string, unknown>;
  if (typeof challengeId !== 'string' || !challengeId) {
    return Response.json({ error: 'challengeId is required' }, { status: 400 });
  }
  if (action !== 'accept' && action !== 'decline' && action !== 'cancel') {
    return Response.json({ error: 'unknown action' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: challenge, error: loadError } = await supabase
    .from('h2h_challenges')
    .select('id, challenger_id, opponent_id, status')
    .eq('id', challengeId)
    .maybeSingle();

  if (loadError) return Response.json({ error: 'could not load that challenge' }, { status: 500 });
  if (!challenge) return Response.json({ error: 'challenge not found' }, { status: 404 });
  if (challenge.status !== 'pending') {
    return Response.json({ error: 'that challenge is no longer open' }, { status: 409 });
  }

  // Only the right party may take each action: the recipient answers, the
  // sender withdraws.
  const isOpponent = challenge.opponent_id === user.id;
  const isChallenger = challenge.challenger_id === user.id;
  if ((action === 'cancel' && !isChallenger) || (action !== 'cancel' && !isOpponent)) {
    return Response.json({ error: 'that is not yours to do' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const update =
    action === 'accept'
      ? { status: 'accepted', accepted_at: now }
      : action === 'decline'
        ? { status: 'declined', cancelled_at: now }
        : { status: 'cancelled', cancelled_at: now };

  const { error } = await supabase.from('h2h_challenges').update(update).eq('id', challengeId);
  if (error) return Response.json({ error: 'could not update that challenge' }, { status: 500 });

  return Response.json({ ok: true, status: update.status });
}
