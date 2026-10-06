// Your fighter.
//
// Cosmetic only — see lib/fighters.ts. Validation lives in that module so this
// route and the builder form cannot drift apart about the rules, and the
// database holds the same limits as check constraints so neither is the only
// thing standing between a long name and a broken row.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { validateFighter } from '@/lib/fighters';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const checked = validateFighter((body ?? {}) as Record<string, unknown>);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

  const supabase = await createServerSupabase();

  // Update first, insert only if there was nothing to update.
  //
  // Not an upsert, which is the obvious way to write this and does not work:
  // PostgREST turns one into ON CONFLICT DO UPDATE over every column in the
  // payload, user_id included, and migration 0024 grants UPDATE on four columns
  // only. Granting user_id as well to make the upsert work would hand clients
  // the ability to try reassigning a fighter to somebody else, which is exactly
  // what the narrow grant exists to prevent.
  //
  // The win/loss columns are absent for the same reason: grading owns them.
  const fields = {
    name: checked.draft.name,
    archetype: checked.draft.archetype,
    banner: checked.draft.banner,
    taunt: checked.draft.taunt,
  };

  const { data: updated, error: updateError } = await supabase
    .from('fighters')
    .update(fields)
    .eq('user_id', user.id)
    .select('user_id');

  if (updateError) {
    console.error('fighter update', updateError.code, updateError.message);
    return Response.json({ error: 'could not save your fighter' }, { status: 500 });
  }

  if ((updated ?? []).length === 0) {
    const { error: insertError } = await supabase
      .from('fighters')
      .insert({ user_id: user.id, ...fields });

    // A duplicate means another request created the row between the update and
    // the insert, and that row is this user's own — so the write landed.
    const raced = insertError?.code === '23505';
    if (insertError && !raced) {
      console.error('fighter create', insertError.code, insertError.message);
      return Response.json({ error: 'could not save your fighter' }, { status: 500 });
    }
    if (raced) {
      const { error: retryError } = await supabase
        .from('fighters')
        .update(fields)
        .eq('user_id', user.id);
      if (retryError) {
        return Response.json({ error: 'could not save your fighter' }, { status: 500 });
      }
    }
  }

  return Response.json({ ok: true, fighter: checked.draft });
}
