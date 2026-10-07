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

  return { title: channelLabel(channel) };
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

  // A plays room can post this week's card, so it needs to know which contest
  // that is. Only looked up for that room: every other channel posts a card
  // from the Picks screen, where the card already is.
  let cardChallengeId: string | null = null;
  if (channel.playsOnly && channel.leagueId) {
    const { data: league } = await supabase
      .from('leagues')
      .select('season, current_week')
      .eq('id', channel.leagueId)
      .maybeSingle();

    if (league) {
      const { data: contest } = await supabase
        .from('pickem_challenges')
        .select('id')
        .eq('league_id', channel.leagueId)
        .eq('season', league.season)
        .eq('week', league.current_week)
        .maybeSingle();
      cardChallengeId = (contest?.id as string) ?? null;
    }
  }

  return (
    <main>
      <AppBar
        title={label}
        back="/feed"
        compact
        trailing={
          isDm && channel.partner ? (
            <Link
              href={`/u/${channel.partner.userId}`}
              aria-label={`${channel.partner.username}'s profile`}
            >
              <Avatar
                username={channel.partner.username}
                url={channel.partner.avatarUrl}
                size="sm"
              />
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
        placeholder={`Message ${label}`}
        initialMessages={messages}
        playsOnly={channel.playsOnly}
        cardChallengeId={cardChallengeId}
      />
    </main>
  );
}
