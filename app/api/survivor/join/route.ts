// Joining a pool with its code.
//
// A SECURITY DEFINER function does the work, for the same reason joining a
// league does: a pool is only readable by its members, so somebody holding an
// invite cannot read the row to find out what they are joining. The code is the
// credential and join_pool_by_code is the only thing that accepts it.

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

  const { code } = (body ?? {}) as Record<string, unknown>;
  if (typeof code !== 'string' || !/^[A-Za-z0-9]{6,10}$/.test(code.trim())) {
    return Response.json({ error: 'That code does not look right.' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('join_pool_by_code', { code: code.trim() });

  if (error) {
    // The function raises with a specific errcode per failure, so the person
    // gets told which thing went wrong rather than "something went wrong".
    const message =
      error.code === 'P0001' && error.message.includes('finished')
        ? 'That pool has already finished.'
        : error.message.includes('no pool')
          ? 'No pool has that code.'
          : 'Could not join that pool.';
    return Response.json({ error: message }, { status: 400 });
  }

  const row = (data as { pool_id: string; pool_name: string }[] | null)?.[0];
  if (!row) return Response.json({ error: 'No pool has that code.' }, { status: 404 });

  return Response.json({ ok: true, poolId: row.pool_id, poolName: row.pool_name });
}
