// Reactions on activity items.
//
// The primary key is (activity_id, user_id, emoji), so tapping twice is
// idempotent rather than double-counting — which is also what makes this safe
// against a retrying client or an impatient double-tap.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { isReaction } from '@/lib/reactions';

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

  const { activityId, emoji } = (body ?? {}) as Record<string, unknown>;

  if (typeof activityId !== 'string' || !activityId) {
    return Response.json({ error: 'activityId is required' }, { status: 400 });
  }
  // Only the offered set: an open emoji field is an open text field.
  if (!isReaction(emoji)) {
    return Response.json({ error: 'that reaction is not available' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  // Tapping the same reaction again removes it, so one control both adds and
  // clears without a separate affordance.
  const { data: existing } = await supabase
    .from('activity_reactions')
    .select('emoji')
    .eq('activity_id', activityId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('activity_reactions')
      .delete()
      .eq('activity_id', activityId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);

    if (error) return Response.json({ error: 'could not remove that reaction' }, { status: 500 });
    return Response.json({ ok: true, added: false });
  }

  const { error } = await supabase
    .from('activity_reactions')
    .insert({ activity_id: activityId, user_id: user.id, emoji });

  if (error) {
    // RLS rejects a reaction on an item outside the viewer's leagues.
    return Response.json({ error: 'could not add that reaction' }, { status: 403 });
  }

  return Response.json({ ok: true, added: true });
}
