// One league: rename it, remove a member, or leave.
//
// Who may do what is enforced by RLS and by the protect_league_identity
// trigger, which blocks reassigning the commissioner or changing the season.
// The checks here exist to return a usable message rather than a raw error.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { name } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 48) {
    return Response.json({ error: 'League names are 3–48 characters.' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('leagues')
    .update({ name: name.trim() })
    .eq('id', id);

  if (error) {
    // The update policy admits only the commissioner.
    return Response.json({ error: 'Only the commissioner can rename a league.' }, { status: 403 });
  }

  return Response.json({ ok: true, name: name.trim() });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const target = new URL(request.url).searchParams.get('member');
  const memberId = target ?? user.id;

  const supabase = await createServerSupabase();

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', id)
    .maybeSingle();

  if (!league) return Response.json({ error: 'league not found' }, { status: 404 });

  // A commissioner leaving would orphan the league: every member would lose the
  // one person who can change anything. They have to hand it over first, which
  // is not built yet, so this is refused with a reason rather than half-done.
  if (memberId === league.commissioner_id) {
    return Response.json(
      { error: 'The commissioner cannot leave their own league.' },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from('league_members')
    .delete()
    .eq('league_id', id)
    .eq('user_id', memberId);

  if (error) {
    return Response.json({ error: 'Could not remove that member.' }, { status: 403 });
  }

  // member_count is recounted rather than decremented so it cannot drift.
  const { count } = await supabase
    .from('league_members')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', id);

  await supabase.from('leagues').update({ member_count: count ?? 0 }).eq('id', id);

  return Response.json({ ok: true });
}
