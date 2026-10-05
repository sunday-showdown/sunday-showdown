// Sending, editing, deleting and paging messages.
//
// Writes go through this route rather than straight from the browser to the
// table, for the same reason picks do: there is work either side of the insert
// that a client cannot be trusted with — the flood guard, resolving @mentions
// to real people, and pushing to the phones of anyone who was named.
//
// Deleting is soft. A message people have replied to and reacted to leaves a
// hole if the row disappears, so deleted_at is set and the bubble says so. The
// immutability trigger in migration 0013 makes that one-way.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { extractMentions, loadMessages, MAX_BODY, excerpt } from '@/lib/chat';
import { isAllowedAttachmentUrl } from '@/lib/attachments';
import { deliver } from '@/lib/notifications';
import { pushToUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

/** Messages per window, per person. High enough never to be felt by a human. */
const FLOOD_LIMIT = 12;
const FLOOD_WINDOW_MS = 15_000;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const channelId = url.searchParams.get('channel');
  const before = url.searchParams.get('before') ?? undefined;

  if (!channelId) return Response.json({ error: 'channel is required' }, { status: 400 });

  const supabase = await createServerSupabase();
  try {
    const messages = await loadMessages(supabase, user.id, channelId, before);
    return Response.json({ messages });
  } catch {
    return Response.json({ error: 'could not load messages' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const {
    channelId,
    body,
    kind,
    attachmentUrl,
    attachmentType,
    attachmentWidth,
    attachmentHeight,
    betId,
    challengeId,
    replyToId,
  } = (payload ?? {}) as Record<string, unknown>;

  if (typeof channelId !== 'string' || !channelId) {
    return Response.json({ error: 'channelId is required' }, { status: 400 });
  }

  const messageKind =
    kind === 'image' || kind === 'bet_slip' || kind === 'pick_card' ? kind : 'text';

  const text = typeof body === 'string' ? body.trim() : '';
  if (text.length > MAX_BODY) {
    return Response.json({ error: `Keep it under ${MAX_BODY} characters.` }, { status: 400 });
  }

  if (messageKind === 'text' && !text) {
    return Response.json({ error: 'Nothing to send.' }, { status: 400 });
  }
  // Not just "is a string": an attachment may only point at somewhere the app
  // put the file itself. See lib/attachments.ts.
  if (messageKind === 'image' && !isAllowedAttachmentUrl(attachmentUrl)) {
    return Response.json({ error: 'That image did not upload.' }, { status: 400 });
  }
  if (messageKind === 'bet_slip' && typeof betId !== 'string') {
    return Response.json({ error: 'That slip is missing.' }, { status: 400 });
  }
  if (messageKind === 'pick_card' && typeof challengeId !== 'string') {
    return Response.json({ error: 'There is no card to share.' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  // Flood guard. Counted across channels, because a loop does not care which
  // room it is in.
  const since = new Date(Date.now() - FLOOD_WINDOW_MS).toISOString();
  const { count: recent } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gt('created_at', since);

  if ((recent ?? 0) >= FLOOD_LIMIT) {
    return Response.json({ error: 'Slow down a second.' }, { status: 429 });
  }

  const { data: inserted, error } = await supabase
    .from('messages')
    .insert({
      channel_id: channelId,
      user_id: user.id,
      kind: messageKind,
      body: text || null,
      attachment_url: messageKind === 'image' ? (attachmentUrl as string) : null,
      attachment_type:
        messageKind === 'image' && typeof attachmentType === 'string' ? attachmentType : null,
      attachment_width:
        messageKind === 'image' && Number.isInteger(attachmentWidth)
          ? (attachmentWidth as number)
          : null,
      attachment_height:
        messageKind === 'image' && Number.isInteger(attachmentHeight)
          ? (attachmentHeight as number)
          : null,
      bet_id: messageKind === 'bet_slip' ? (betId as string) : null,
      // Only the contest id is stored. The card is read from the sender's own
      // picks when the message renders, so it fills in with results as the week
      // grades — and so nobody can post a card that is not theirs.
      card_challenge_id: messageKind === 'pick_card' ? (challengeId as string) : null,
      reply_to_id: typeof replyToId === 'string' ? replyToId : null,
    })
    .select('id, created_at')
    .single();

  if (error || !inserted) {
    // A unique violation here is the one case that is not a permission problem:
    // the same card has already been shared in this channel.
    if (error?.code === '23505') {
      return Response.json({ error: 'You already shared that card here.' }, { status: 409 });
    }
    // RLS rejects a message in a channel this person cannot read.
    return Response.json({ error: 'Could not send that.' }, { status: 403 });
  }

  // Everything below is best effort: the message is already sent, and a failed
  // notification must not read as a failed send.
  await notifyAbout(supabase, {
    channelId,
    messageId: inserted.id as string,
    senderId: user.id,
    text,
    kind: messageKind,
  });

  return Response.json({ ok: true, messageId: inserted.id, createdAt: inserted.created_at });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { messageId, body } = (payload ?? {}) as Record<string, unknown>;
  if (typeof messageId !== 'string') {
    return Response.json({ error: 'messageId is required' }, { status: 400 });
  }

  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return Response.json({ error: 'An edit cannot be empty.' }, { status: 400 });
  if (text.length > MAX_BODY) {
    return Response.json({ error: `Keep it under ${MAX_BODY} characters.` }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('messages')
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('user_id', user.id);

  if (error) return Response.json({ error: 'Could not edit that.' }, { status: 403 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const messageId = url.searchParams.get('id');
  if (!messageId) return Response.json({ error: 'id is required' }, { status: 400 });

  const supabase = await createServerSupabase();

  // Soft delete, author only. A commissioner clearing somebody else's message
  // uses the hard delete the RLS policy allows, which is a separate decision
  // and a separate control.
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: null })
    .eq('id', messageId)
    .eq('user_id', user.id);

  if (error) return Response.json({ error: 'Could not delete that.' }, { status: 403 });
  return Response.json({ ok: true });
}

/**
 * Tell the right people something was said.
 *
 * A DM notifies the other person about anything. A league channel notifies
 * only the people actually named — a room that buzzed every member on every
 * message would be muted inside a day.
 */
async function notifyAbout(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  message: {
    channelId: string;
    messageId: string;
    senderId: string;
    text: string;
    kind: 'text' | 'image' | 'bet_slip' | 'pick_card';
  },
): Promise<void> {
  try {
    const { data: channel } = await supabase
      .from('channels')
      .select('id, kind, name, league_id')
      .eq('id', message.channelId)
      .maybeSingle();

    if (!channel) return;

    const { data: sender } = await supabase
      .from('profiles')
      .select('username')
      .eq('user_id', message.senderId)
      .maybeSingle();

    const senderName = (sender?.username as string) ?? 'Someone';
    const preview = excerpt({ kind: message.kind, body: message.text || null });

    let recipients: string[] = [];
    let type: 'mention' | 'direct_message' = 'mention';
    let title = '';

    if (channel.kind === 'dm') {
      const { data: members } = await supabase
        .from('channel_members')
        .select('user_id')
        .eq('channel_id', channel.id);

      recipients = (members ?? [])
        .map((m) => m.user_id as string)
        .filter((id) => id !== message.senderId);
      type = 'direct_message';
      title = senderName;
    } else {
      const usernames = extractMentions(message.text);
      if (usernames.length === 0) return;

      // Resolve against this league's members only, so @someone in another
      // league is just text.
      const { data: members } = await supabase
        .from('league_members')
        .select('user_id')
        .eq('league_id', channel.league_id as string);

      const memberIds = (members ?? []).map((m) => m.user_id as string);
      if (memberIds.length === 0) return;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username')
        .in('user_id', memberIds);

      const wanted = new Set(usernames);
      recipients = (profiles ?? [])
        .filter((p) => wanted.has((p.username as string).toLowerCase()))
        .map((p) => p.user_id as string)
        .filter((id) => id !== message.senderId);

      title = `${senderName} in #${channel.name}`;
    }

    if (recipients.length === 0) return;

    const url = `/feed/c/${channel.id}`;

    await deliver(
      supabase,
      recipients.map((userId) => ({
        userId,
        type,
        title,
        message: preview,
        // Keyed to the message, so a retry cannot notify twice.
        key: `msg:${message.messageId}:${userId}`,
        data: { channelId: channel.id, messageId: message.messageId, url },
      })),
    );

    await pushToUsers(supabase, recipients, {
      title,
      body: preview,
      url,
      tag: `channel-${channel.id}`,
    });
  } catch {
    // The message is sent. Notification failure is not the sender's problem.
  }
}
