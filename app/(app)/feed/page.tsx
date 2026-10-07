import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { loadChannels } from '@/lib/chat';
import AppBar from '@/components/AppBar';
import ChannelList, { type DmCandidate } from '@/components/ChannelList';
import EmptyState from '@/components/EmptyState';

export const metadata = { title: 'Chat' };
export const dynamic = 'force-dynamic';

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const user = (await getSessionUser())!;
  const params = await searchParams;
  const supabase = await createServerSupabase();

  // No league required. Chat used to refuse to render without one, which made
  // messaging a friend conditional on being in a league with somebody — and a
  // direct message has never had anything to do with a league.
  const { leagues, league } = await resolveLeague(supabase, user.id);

  const [channels, { data: members }, { data: following }] = await Promise.all([
    loadChannels(supabase, user.id),
    // Every league's members, not just the active one's: who you may message is
    // not a property of whichever league happens to be selected.
    supabase.from('league_members').select('user_id'),
    supabase.from('follows').select('following_id').eq('follower_id', user.id),
  ]);

  // Anyone you can message: your league, plus anyone you follow who is not in
  // it. Both are people you already have a relationship with in the app, which
  // is what keeps this from being a way to message strangers.
  const memberIds = (members ?? []).map((m) => m.user_id as string).filter((id) => id !== user.id);
  const followedIds = (following ?? [])
    .map((f) => f.following_id as string)
    .filter((id) => id !== user.id);

  const candidateIds = [...new Set([...memberIds, ...followedIds])];
  const { data: profiles } = candidateIds.length
    ? await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', candidateIds)
    : { data: [] };

  const inLeague = new Set(memberIds);
  const candidates: DmCandidate[] = (profiles ?? [])
    .map((profile) => ({
      userId: profile.user_id as string,
      username: profile.username as string,
      avatarUrl: (profile.avatar_url as string) ?? null,
      reason: inLeague.has(profile.user_id as string) ? 'In your league' : 'You follow them',
    }))
    .sort((a, b) => a.username.localeCompare(b.username));

  const unread = channels.reduce((sum, channel) => sum + channel.unread, 0);

  return (
    <main>
      <AppBar
        title="Chat"
        subtitle={unread > 0 ? `${unread} unread` : 'Leagues, plays and friends'}
      />

      <ChannelList
        channels={channels}
        leagues={leagues}
        leagueId={league?.id ?? null}
        isCommissioner={league !== null && league.commissioner_id === user.id}
        candidates={candidates}
      />
    </main>
  );
}
