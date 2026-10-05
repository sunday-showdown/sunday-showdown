// Playground: freeform calls, for bragging rights rather than points.
//
// Deliberately unscored. It exists so a league has somewhere to put the
// predictions that do not fit a market, and a record of who actually called it.

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

  const { action, leagueId, season, week } = (body ?? {}) as Record<string, unknown>;

  if (typeof leagueId !== 'string' || typeof season !== 'number' || typeof week !== 'number') {
    return Response.json({ error: 'league, season and week are required' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  if (action === 'publish') {
    const { cardId } = body as Record<string, unknown>;
    if (typeof cardId !== 'string') {
      return Response.json({ error: 'nothing to publish yet' }, { status: 400 });
    }

    // published_at is required whenever is_published is true (check constraint),
    // so both move together.
    const { error } = await supabase
      .from('playground_cards')
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq('id', cardId)
      .eq('user_id', user.id);

    if (error) return Response.json({ error: 'could not publish' }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (action !== 'add') {
    return Response.json({ error: 'unknown action' }, { status: 400 });
  }

  const { targetName, prediction, confidence } = body as Record<string, unknown>;

  if (typeof targetName !== 'string' || targetName.trim().length === 0 || targetName.length > 60) {
    return Response.json({ error: 'Give the call a subject.' }, { status: 400 });
  }
  if (typeof prediction !== 'string' || prediction.trim().length === 0 || prediction.length > 140) {
    return Response.json({ error: 'Say what you think happens.' }, { status: 400 });
  }
  const stars =
    typeof confidence === 'number' && confidence >= 1 && confidence <= 5 ? confidence : null;

  // One card per user per league-week; create it on the first call.
  const { data: existing } = await supabase
    .from('playground_cards')
    .select('id, is_published')
    .eq('user_id', user.id)
    .eq('league_id', leagueId)
    .eq('season', season)
    .eq('week', week)
    .maybeSingle();

  if (existing?.is_published) {
    return Response.json(
      { error: 'This card is published. Calls are locked once your league can see them.' },
      { status: 409 },
    );
  }

  let cardId = existing?.id as string | undefined;

  if (!cardId) {
    const { data: created, error } = await supabase
      .from('playground_cards')
      .insert({ user_id: user.id, league_id: leagueId, season, week, is_published: false })
      .select('id')
      .single();

    if (error || !created) {
      return Response.json({ error: 'could not start a card' }, { status: 500 });
    }
    cardId = created.id as string;
  }

  const { error: insertError } = await supabase.from('playground_picks').insert({
    card_id: cardId,
    user_id: user.id,
    season,
    week,
    pick_type: 'freeform',
    target_name: targetName.trim(),
    prediction: prediction.trim(),
    confidence: stars,
  });

  if (insertError) {
    return Response.json({ error: 'could not add that call' }, { status: 500 });
  }

  return Response.json({ ok: true, cardId });
}
