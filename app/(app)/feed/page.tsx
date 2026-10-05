import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues } from '@/lib/week';
import FeedTabs from '@/components/FeedTabs';
import LeagueSwitcher from '@/components/LeagueSwitcher';
import EmptyState from '@/components/EmptyState';
import type { FeedItem } from '@/components/ActivityItem';

export const metadata = { title: 'Feed' };
export const dynamic = 'force-dynamic';

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const user = (await getSessionUser())!;
  const params = await searchParams;
  const supabase = await createServerSupabase();

  const leagues = await loadMyLeagues(supabase, user.id);
  if (leagues.length === 0) {
    return (
      <EmptyState
        title="No league yet"
        body="The feed fills up with your league's results, upsets and streaks."
        action={<Link href="/leagues/new" className="btn-primary px-5 text-sm">Create a league</Link>}
      />
    );
  }

  const league = leagues.find((l) => l.id === params.league) ?? leagues[0]!;

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
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-3">
        <div className="min-w-0">
          <h1 className="display text-[28px] leading-none">Feed</h1>
          <p className="truncate text-[11px] text-muted">{league.name}</p>
        </div>
        <LeagueSwitcher leagues={leagues} currentId={league.id} />
      </header>

      <FeedTabs league={all} friends={friendItems} friendCount={friendIds.size} />
    </main>
  );
}
