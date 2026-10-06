// Marking the tour as seen.
//
// One column, one write. Kept apart from /api/profile because that route is
// about things a person edits and this is a fact the app records about them.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (error) return Response.json({ error: 'could not save that' }, { status: 500 });
  return Response.json({ ok: true });
}

/** Clear the marker, so the tour runs again. */
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('profiles')
    .update({ onboarded_at: null })
    .eq('user_id', user.id);

  if (error) return Response.json({ error: 'could not save that' }, { status: 500 });
  return Response.json({ ok: true });
}
