// Reactions on a message.
//
// The primary key is (message_id, user_id, emoji), so a double tap is
// idempotent. Tapping an existing reaction clears it, which is one control for
// both directions.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { QUICK_REACTIONS } from '@/lib/chat';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { messageId, emoji } = (payload ?? {}) as Record<string, unknown>;
  if (typeof messageId !== 'string' || !messageId) {
    return Response.json({ error: 'messageId is required' }, { status: 400 });
  }
  // The offered set only: an open emoji field is an open text field.
  if (typeof emoji !== 'string' || !(QUICK_REACTIONS as readonly string[]).includes(emoji)) {
    return Response.json({ error: 'that reaction is not available' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: existing } = await supabase
    .from('message_reactions')
    .select('emoji')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);

    if (error) return Response.json({ error: 'could not remove that' }, { status: 500 });
    return Response.json({ ok: true, added: false });
  }

  const { error } = await supabase
    .from('message_reactions')
    .insert({ message_id: messageId, user_id: user.id, emoji });

  if (error) return Response.json({ error: 'could not add that' }, { status: 403 });
  return Response.json({ ok: true, added: true });
}
