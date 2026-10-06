import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { loadSeasonStandings } from '@/lib/standings';
import LeagueSwitcher from '@/components/LeagueSwitcher';
import EmptyState from '@/components/EmptyState';
import AppBar from '@/components/AppBar';
import Leaderboard, { type RankedPlayer } from '@/components/Leaderboard';

export const metadata = { title: 'Ranks' };
export const dynamic = 'force-dynamic';

export default async function RanksPage({
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
        <AppBar title="Ranks" />
        <EmptyState
          title="No league yet"
          body="Ranks need somebody to rank. Create a league or join one with a code."
          action={
            <Link href="/leagues/new" className="btn-primary px-5 text-sm">
              Create a league
            </Link>
          }
        />
      </main>
    );
  }

  const rows = await loadSeasonStandings(supabase, league.id, league.season);

  // Streaks live on the profile, not in weekly_results, so the streak board
  // needs them joined on. One query for the whole table.
  const { data: profiles } = rows.length
    ? await supabase
        .from('profiles')
        .select('user_id, avatar_url, current_pickem_streak, longest_pickem_streak')
        .in('user_id', rows.map((row) => row.userId))
    : { data: [] };

  const extraOf = new Map(
    (
      (profiles ?? []) as {
        user_id: string;
        avatar_url: string | null;
        current_pickem_streak: number;
        longest_pickem_streak: number;
      }[]
    ).map((p) => [p.user_id, p]),
  );

  const players: RankedPlayer[] = rows.map((row) => ({
    ...row,
    avatarUrl: extraOf.get(row.userId)?.avatar_url ?? null,
    currentStreak: extraOf.get(row.userId)?.current_pickem_streak ?? 0,
    longestStreak: extraOf.get(row.userId)?.longest_pickem_streak ?? 0,
  }));

  return (
    <main className="pb-6">
      <AppBar
        title="Ranks"
        subtitle={`${league.name} · ${league.season}`}
        trailing={<LeagueSwitcher leagues={leagues} currentId={league.id} />}
      />

      {players.length === 0 ? (
        <EmptyState
          title="Nothing graded yet"
          body="The boards fill in automatically once the first week's games are final."
        />
      ) : (
        <div className="px-4">
          <Leaderboard rows={players} myUserId={user.id} />
        </div>
      )}
    </main>
  );
}
