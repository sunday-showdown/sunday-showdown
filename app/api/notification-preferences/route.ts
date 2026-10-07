// Which notifications somebody wants.
//
// The columns have existed since migration 0006 and nothing in the app ever
// wrote to them, so every switch was on for everybody with no way to turn one
// off. lib/notifications.ts has always read them.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** The switches a person owns. Anything not here is not theirs to set. */
const TOGGLES = [
  'deadline_approaching',
  'picks_locked',
  'game_final',
  'first_place',
  'passed_in_standings',
  'td_scored',
  'weekly_results',
  'achievements',
] as const;

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const patch: Record<string, boolean> = {};

  for (const key of TOGGLES) {
    if (typeof input[key] === 'boolean') patch[key] = input[key] as boolean;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  // Upsert: somebody who has never changed a setting has no row at all, and the
  // defaults they have been getting are the column defaults.
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' });

  if (error) return Response.json({ error: 'Could not save that.' }, { status: 403 });
  return Response.json({ ok: true });
}
