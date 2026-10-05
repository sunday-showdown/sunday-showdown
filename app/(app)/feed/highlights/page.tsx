import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import FeedTabs from '@/components/FeedTabs';
import AppBar from '@/components/AppBar';
import LeagueSwitcher from '@/components/LeagueSwitcher';
import EmptyState from '@/components/EmptyState';
import type { FeedItem } from '@/components/ActivityItem';

export const metadata = { title: 'Highlights' };
export const dynamic = 'force-dynamic';

export default async function HighlightsPage({
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
        <AppBar title="Highlights" back="/feed" />
        <EmptyState
          title="No league yet"
          body="Highlights fill up with your league's results, upsets and streaks."
          action={<Link href="/leagues/new" className="btn-primary px-5 text-sm">Create a league</Link>}
        />
      </main>
    );
  }


  const [{ data: activity }, { data: following }] = await Promise.all([
    supabase
      .from('league_activity')
      .select('id, activity_type, message, created_at, week, user_id')
      .eq('league_id', league.id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('follows').select('following_id').eq('follower_id', user.id),
  ]);

  const friendIds = new Set((following ?? []).map((f) => f.following_id as string));
  const ids = (activity ?? []).map((a) => a.id as string);

  // One query for every reaction on the page rather than one per item.
  const { data: reactionRows } = ids.length
    ? await supabase
        .from('activity_reactions')
        .select('activity_id, user_id, emoji')
        .in('activity_id', ids)
    : { data: [] };

  const counts = new Map<string, Record<string, number>>();
  const mine = new Map<string, string[]>();
  for (const row of reactionRows ?? []) {
    const id = row.activity_id as string;
    const emoji = row.emoji as string;
    const tally = counts.get(id) ?? {};
    tally[emoji] = (tally[emoji] ?? 0) + 1;
    counts.set(id, tally);
    if (row.user_id === user.id) mine.set(id, [...(mine.get(id) ?? []), emoji]);
  }

  const toItem = (a: Record<string, unknown>): FeedItem => ({
    id: a.id as string,
    activityType: a.activity_type as string,
    message: a.message as string,
    createdAt: a.created_at as string,
    week: (a.week as number) ?? null,
    reactions: counts.get(a.id as string) ?? {},
    myReactions: mine.get(a.id as string) ?? [],
  });

  const all = (activity ?? []).map(toItem);
  const friendItems = (activity ?? [])
    .filter((a) => a.user_id !== null && friendIds.has(a.user_id as string))
    .map(toItem);

  return (
    <main className="pb-6">
      <AppBar
        title="Highlights"
        subtitle={`${league.name} · written by the app as results land`}
        back="/feed"
        trailing={<LeagueSwitcher leagues={leagues} currentId={league.id} />}
      />

      <FeedTabs league={all} friends={friendItems} friendCount={friendIds.size} />
    </main>
  );
}
