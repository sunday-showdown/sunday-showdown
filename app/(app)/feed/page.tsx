import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues } from '@/lib/week';
import ActivityItem, { type FeedItem } from '@/components/ActivityItem';
import EmptyState from '@/components/EmptyState';

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
        action={<Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">Create a league</Link>}
      />
    );
  }

  const league = leagues.find((l) => l.id === params.league) ?? leagues[0]!;

  const { data: activity } = await supabase
    .from('league_activity')
    .select('id, activity_type, message, created_at, week')
    .eq('league_id', league.id)
    .order('created_at', { ascending: false })
    .limit(50);

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

  const items: FeedItem[] = (activity ?? []).map((a) => ({
    id: a.id as string,
    activityType: a.activity_type as string,
    message: a.message as string,
    createdAt: a.created_at as string,
    week: (a.week as number) ?? null,
    reactions: counts.get(a.id as string) ?? {},
    myReactions: mine.get(a.id as string) ?? [],
  }));

  return (
    <main className="pb-4">
      <header className="px-4 pb-2 pt-3 safe-top">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Feed</h1>
        <p className="text-xs text-muted">{league.name}</p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          body="Once a week is graded, winners, upsets and streaks show up here automatically."
        />
      ) : (
        <div className="space-y-2 px-4">
          {items.map((item) => (
            <ActivityItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
