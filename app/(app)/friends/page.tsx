import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import FriendsPanel, { type FriendRow } from '@/components/FriendsPanel';

export const metadata = { title: 'Friends' };
export const dynamic = 'force-dynamic';

export default async function FriendsPage() {
  const user = (await getSessionUser())!;
  const supabase = await createServerSupabase();

  // Both directions in two queries, then merged — one row per person with who
  // follows whom, rather than a query per relationship.
  const [{ data: iFollow }, { data: followMe }] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', user.id),
    supabase.from('follows').select('follower_id').eq('following_id', user.id),
  ]);

  const followingIds = new Set((iFollow ?? []).map((f) => f.following_id as string));
  const followerIds = new Set((followMe ?? []).map((f) => f.follower_id as string));
  const everyone = [...new Set([...followingIds, ...followerIds])];

  const { data: profiles } = everyone.length
    ? await supabase
        .from('profiles')
        .select('user_id, username, favorite_team, career_pickem_wins')
        .in('user_id', everyone)
    : { data: [] };

  // Season points, so a friend row says something more useful than a name.
  const { data: results } = everyone.length
    ? await supabase.from('weekly_results').select('user_id, total_points').in('user_id', everyone)
    : { data: [] };

  const pointsFor = new Map<string, number>();
  for (const row of results ?? []) {
    const id = row.user_id as string;
    pointsFor.set(id, (pointsFor.get(id) ?? 0) + Number(row.total_points));
  }

  const friends: FriendRow[] = (profiles ?? [])
    .map((p) => ({
      userId: p.user_id as string,
      username: p.username as string,
      favoriteTeam: (p.favorite_team as string) ?? null,
      following: followingIds.has(p.user_id as string),
      followsYou: followerIds.has(p.user_id as string),
      points: pointsFor.get(p.user_id as string) ?? null,
    }))
    .sort((a, b) => a.username.localeCompare(b.username));

  return (
    <main className="pb-6">
      <header className="px-4 pb-3 pt-3">
        <h1 className="display text-[28px] leading-none">Friends</h1>
        <p className="text-[11px] text-muted">
          Follow each other and you&apos;re friends
        </p>
      </header>

      <FriendsPanel friends={friends} />
    </main>
  );
}
