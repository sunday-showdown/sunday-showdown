// Storing and clearing a device's push subscription.
//
// One subscription per user: a second device replaces the first rather than
// both receiving. Supporting several would mean a table of its own, and for a
// friends-group app the phone in your pocket is the device that matters.

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

  const { subscription, enabled } = (body ?? {}) as Record<string, unknown>;
  const supabase = await createServerSupabase();

  if (enabled === false) {
    const { error } = await supabase
      .from('notification_preferences')
      .update({ push_subscription: null })
      .eq('user_id', user.id);

    if (error) return Response.json({ error: 'could not turn off push' }, { status: 500 });
    return Response.json({ ok: true, enabled: false });
  }

  // Shape-check rather than trusting the body: a malformed subscription would
  // fail silently on every send for the rest of the season.
  const candidate = subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (
    !candidate ||
    typeof candidate.endpoint !== 'string' ||
    typeof candidate.keys?.p256dh !== 'string' ||
    typeof candidate.keys?.auth !== 'string'
  ) {
    return Response.json({ error: 'that subscription is not valid' }, { status: 400 });
  }

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      { user_id: user.id, push_subscription: candidate },
      { onConflict: 'user_id' },
    );

  if (error) return Response.json({ error: 'could not save that subscription' }, { status: 500 });
  return Response.json({ ok: true, enabled: true });
}
