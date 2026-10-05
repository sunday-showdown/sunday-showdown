// Marking notifications read.

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

  const { id, all } = (body ?? {}) as Record<string, unknown>;
  const supabase = await createServerSupabase();

  // RLS already limits this to the caller's own rows; the user_id filter makes
  // that explicit rather than relying on it alone.
  const query = supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);

  const { error } =
    all === true ? await query.eq('is_read', false) : await query.eq('id', String(id ?? ''));

  if (error) return Response.json({ error: 'could not update' }, { status: 500 });
  return Response.json({ ok: true });
}
