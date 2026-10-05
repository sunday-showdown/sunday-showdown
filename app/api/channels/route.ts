// Channels: opening a room, naming one, marking it read.
//
// Two of these actions are database functions rather than inserts, and for the
// same reason in both cases: the row and the rows that grant access to it have
// to appear together. See the note above open_dm in migration 0013.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MODES = ['pickem', 'survivor', 'td', 'h2h', 'playground'] as const;

/** The total unread badge on the nav. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('channel_unread_counts');
  if (error) return Response.json({ unread: 0 });

  const unread = ((data ?? []) as { unread: number }[]).reduce(
    (sum, row) => sum + (Number(row.unread) || 0),
    0,
  );
  return Response.json({ unread });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { action } = (body ?? {}) as Record<string, unknown>;
  const supabase = await createServerSupabase();

  if (action === 'openDm') {
    const { userId } = body as Record<string, unknown>;
    if (typeof userId !== 'string' || !userId) {
      return Response.json({ error: 'Who do you want to message?' }, { status: 400 });
    }
    if (userId === user.id) {
      return Response.json({ error: 'You cannot message yourself.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('open_dm', { other_user: userId });
    if (error || !data) {
      return Response.json({ error: 'Could not open that conversation.' }, { status: 400 });
    }
    return Response.json({ ok: true, channelId: data as string });
  }

  if (action === 'ensureMode') {
    const { leagueId, mode } = body as Record<string, unknown>;
    if (typeof leagueId !== 'string' || typeof mode !== 'string') {
      return Response.json({ error: 'league and mode are required' }, { status: 400 });
    }
    if (!(MODES as readonly string[]).includes(mode)) {
      return Response.json({ error: 'unknown mode' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('ensure_mode_channel', {
      target_league: leagueId,
      target_mode: mode,
    });
    if (error || !data) {
      return Response.json({ error: 'Could not open that room.' }, { status: 400 });
    }
    return Response.json({ ok: true, channelId: data as string });
  }

  if (action === 'create') {
    const { leagueId, name, topic } = body as Record<string, unknown>;
    if (typeof leagueId !== 'string' || typeof name !== 'string') {
      return Response.json({ error: 'league and name are required' }, { status: 400 });
    }

    // Discord's own shape: lowercase, hyphens, no spaces. Doing it here rather
    // than asking people to type it means two channels cannot differ only by
    // capitalisation.
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

    if (slug.length < 2) {
      return Response.json({ error: 'Give the channel a name.' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('channels')
      .select('id')
      .eq('league_id', leagueId)
      .eq('name', slug)
      .maybeSingle();

    if (existing) {
      return Response.json({ ok: true, channelId: existing.id as string, existed: true });
    }

    const { count } = await supabase
      .from('channels')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId);

    if ((count ?? 0) >= 20) {
      return Response.json({ error: 'That league has enough channels.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('channels')
      .insert({
        kind: 'league',
        league_id: leagueId,
        name: slug,
        topic: typeof topic === 'string' && topic.trim() ? topic.trim().slice(0, 200) : null,
        emoji: '💬',
        position: (count ?? 0) + 1,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error || !data) {
      // RLS rejects a channel in a league this person is not in.
      return Response.json({ error: 'Could not create that channel.' }, { status: 403 });
    }
    return Response.json({ ok: true, channelId: data.id as string });
  }

  if (action === 'markRead') {
    const { channelId } = body as Record<string, unknown>;
    if (typeof channelId !== 'string') {
      return Response.json({ error: 'channelId is required' }, { status: 400 });
    }
    const { error } = await supabase.rpc('mark_channel_read', { target_channel: channelId });
    if (error) return Response.json({ error: 'could not mark that read' }, { status: 400 });
    return Response.json({ ok: true });
  }

  if (action === 'update') {
    const { channelId, topic } = body as Record<string, unknown>;
    if (typeof channelId !== 'string') {
      return Response.json({ error: 'channelId is required' }, { status: 400 });
    }
    // Only the topic. A channel's name is in links people have already shared,
    // and renaming is the commissioner power nobody asked for.
    const { error } = await supabase
      .from('channels')
      .update({ topic: typeof topic === 'string' ? topic.trim().slice(0, 200) || null : null })
      .eq('id', channelId);

    if (error) return Response.json({ error: 'Only the commissioner can do that.' }, { status: 403 });
    return Response.json({ ok: true });
  }

  if (action === 'delete') {
    const { channelId } = body as Record<string, unknown>;
    if (typeof channelId !== 'string') {
      return Response.json({ error: 'channelId is required' }, { status: 400 });
    }
    // RLS allows this only for a commissioner, and never for the default room.
    const { error } = await supabase.from('channels').delete().eq('id', channelId);
    if (error) return Response.json({ error: 'Could not delete that channel.' }, { status: 403 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
