// Profile settings a person owns.
//
// Column grants decide what is actually writable here (migrations 0009 and
// 0020); this route exists to validate and to return a sentence somebody can
// act on rather than a Postgres error.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { isSportsbook } from '@/lib/sportsbooks';

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

  const { unitSize, username, preferredBooks } = (body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (username !== undefined) {
    const name = String(username).trim();
    // The same shape the check constraint enforces (migration 0033), said in
    // English rather than as a constraint violation.
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(name)) {
      return Response.json(
        { error: '3 to 20 characters: letters, numbers, underscore or dot.' },
        { status: 400 },
      );
    }
    patch.username = name;
  }

  if (preferredBooks !== undefined) {
    if (!Array.isArray(preferredBooks) || preferredBooks.some((id) => typeof id !== 'string')) {
      return Response.json({ error: 'Pick your books from the list.' }, { status: 400 });
    }
    const chosen = (preferredBooks as string[]).filter((id) => isSportsbook(id));
    // An empty choice means "no preference", which is stored as null so the
    // composer can tell it apart from somebody who deliberately picked none.
    patch.preferred_books = chosen.length > 0 ? chosen : null;
  }

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

  if (error) {
    const taken = error.code === '23505';
    return Response.json(
      { error: taken ? 'That name is taken.' : 'Could not save that.' },
      { status: taken ? 409 : 403 },
    );
  }
  return Response.json({ ok: true });
}
