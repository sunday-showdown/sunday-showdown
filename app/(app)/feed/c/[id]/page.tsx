import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadChannel, loadMessages, channelLabel } from '@/lib/chat';
import AppBar from '@/components/AppBar';
import Avatar from '@/components/Avatar';
import ChatRoom from '@/components/ChatRoom';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return { title: 'Chat' };

  const supabase = await createServerSupabase();
  const channel = await loadChannel(supabase, user.id, (await params).id);
  if (!channel) return { title: 'Chat' };

  return { title: channel.kind === 'dm' ? channelLabel(channel) : `#${channel.name}` };
}

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getSessionUser())!;
  const { id } = await params;
  const supabase = await createServerSupabase();

  const channel = await loadChannel(supabase, user.id, id);
  // RLS already hides a channel outside this person's leagues and DMs, so a
  // miss here is indistinguishable from one that does not exist — which is the
  // right answer either way.
  if (!channel) notFound();

  const messages = await loadMessages(supabase, user.id, channel.id);
  const isDm = channel.kind === 'dm';
  const label = channelLabel(channel);

  return (
    <main>
      <AppBar
        title={isDm ? label : `#${label}`}
        back="/feed"
        compact
        trailing={
          isDm && channel.partner ? (
            <Link
              href={`/u/${channel.partner.userId}`}
              aria-label={`${channel.partner.username}'s profile`}
            >
              <Avatar username={channel.partner.username} size="sm" />
            </Link>
          ) : channel.topic ? (
            <span className="max-w-[160px] truncate text-[11px] text-muted">{channel.topic}</span>
          ) : null
        }
      />

      <ChatRoom
        channelId={channel.id}
        leagueId={channel.leagueId}
        myUserId={user.id}
        placeholder={isDm ? `Message ${label}` : `Message #${label}`}
        initialMessages={messages}
      />
    </main>
  );
}
