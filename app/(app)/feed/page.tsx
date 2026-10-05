import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { loadChannels } from '@/lib/chat';
import AppBar from '@/components/AppBar';
import ChannelList, { type DmCandidate } from '@/components/ChannelList';
import LeagueSwitcher from '@/components/LeagueSwitcher';
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

  const { leagues, league } = await resolveLeague(supabase, user.id, params.league);
  if (!league) {
    return (
      <main>
        <AppBar title="Chat" />
        <EmptyState
          title="No league yet"
          body="Channels belong to a league. Create one or join with a code and the rooms appear."
          action={
            <div className="flex flex-col gap-2">
              <Link href="/leagues/new" className="btn-primary px-5 text-sm">
                Create a league
              </Link>
              <Link href="/leagues/join" className="btn-ghost px-5 text-sm">
                Join with a code
              </Link>
            </div>
          }
        />
      </main>
    );
  }


  const [channels, { data: members }, { data: following }] = await Promise.all([
    loadChannels(supabase, user.id),
    supabase.from('league_members').select('user_id').eq('league_id', league.id),
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
        subtitle={
          unread > 0
            ? `${unread} unread across your leagues`
            : 'Talk, pictures, GIFs, slips and cards'
        }
        trailing={<LeagueSwitcher leagues={leagues} currentId={league.id} />}
      />

      <ChannelList
        channels={channels}
        leagues={leagues}
        leagueId={league.id}
        isCommissioner={league.commissioner_id === user.id}
        candidates={candidates}
      />
    </main>
  );
}
