// Friends.
//
// A follow, not a mutual request: one tap, no approval queue, and no pending
// state for anyone to forget about. Two people following each other are
// "friends" and the UI says so.
//
// The primary key on (follower_id, following_id) makes following twice a no-op,
// which is what protects this from a double tap or a retrying client.

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

  const { userId, follow } = (body ?? {}) as Record<string, unknown>;

  if (typeof userId !== 'string' || !userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 });
  }
  if (userId === user.id) {
    return Response.json({ error: 'You cannot follow yourself.' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  if (follow === false) {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', userId);

    if (error) return Response.json({ error: 'could not unfollow' }, { status: 500 });
    return Response.json({ ok: true, following: false });
  }

  const { error } = await supabase
    .from('follows')
    .upsert(
      { follower_id: user.id, following_id: userId },
      { onConflict: 'follower_id,following_id', ignoreDuplicates: true },
    );

  if (error) {
    return Response.json({ error: 'could not follow' }, { status: 500 });
  }

  return Response.json({ ok: true, following: true });
}

/** Search for someone by username. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const query = (new URL(request.url).searchParams.get('q') ?? '').trim();
  // Two characters is the floor: a single letter returns most of the table and
  // is not a search anyone meant to run.
  if (query.length < 2) return Response.json({ results: [] });

  const supabase = await createServerSupabase();

  // Escape the LIKE wildcards so a username containing % or _ cannot widen the
  // search beyond what was typed.
  const safe = query.replace(/[%_\\]/g, (match) => `\\${match}`);

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, avatar_url, favorite_team')
    .ilike('username', `%${safe}%`)
    .neq('user_id', user.id)
    .limit(20);

  if (error) return Response.json({ error: 'search failed' }, { status: 500 });

  const ids = (data ?? []).map((p) => p.user_id as string);
  const { data: existing } = ids.length
    ? await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', ids)
    : { data: [] };

  const followed = new Set((existing ?? []).map((f) => f.following_id as string));

  return Response.json({
    results: (data ?? []).map((p) => ({
      userId: p.user_id as string,
      username: p.username as string,
      avatarUrl: (p.avatar_url as string) ?? null,
      favoriteTeam: (p.favorite_team as string) ?? null,
      following: followed.has(p.user_id as string),
    })),
  });
}
