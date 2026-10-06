// Profile settings a person owns.
//
// Column grants decide what is actually writable here (migrations 0009 and
// 0020); this route exists to validate and to return a sentence somebody can
// act on rather than a Postgres error.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { unitSize } = (body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (unitSize !== undefined) {
    const value = Number(unitSize);
    // A unit of zero would make every units figure infinite, which the check
    // constraint also refuses — this just says so in English.
    if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
      return Response.json({ error: 'A unit has to be more than zero.' }, { status: 400 });
    }
    patch.unit_size = Math.round(value * 100) / 100;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('profiles').update(patch).eq('user_id', user.id);

  if (error) return Response.json({ error: 'Could not save that.' }, { status: 403 });
  return Response.json({ ok: true });
}
