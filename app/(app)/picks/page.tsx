import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues, loadWeek } from '@/lib/week';
import { loadPot } from '@/lib/pot';
import PickSheet from '@/components/PickSheet';
import WeekSelector from '@/components/WeekSelector';
import EmptyState from '@/components/EmptyState';
import LeagueSwitcher from '@/components/LeagueSwitcher';
import AppBar from '@/components/AppBar';
import ModePot from '@/components/ModePot';
import ModeChatButton from '@/components/ModeChatButton';

export const metadata = { title: 'Picks' };

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; league?: string }>;
}) {
  const user = (await getSessionUser())!;
  const params = await searchParams;
  const supabase = await createServerSupabase();

  const leagues = await loadMyLeagues(supabase, user.id);

  if (leagues.length === 0) {
    return (
      <main>
        <AppBar title="Picks" />
        <EmptyState
          title="No league yet"
          body="Create one and invite your friends, or join with an invite code."
          action={
            <Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">
              Create a league
            </Link>
          }
        />
      </main>
    );
  }

  const league = leagues.find((l) => l.id === params.league) ?? leagues[0]!;
  const requested = Number(params.week);
  const week =
    Number.isInteger(requested) && requested >= 1 && requested <= 18
      ? requested
      : league.current_week;

  const [data, pot] = await Promise.all([
    loadWeek(supabase, user.id, league, week),
    loadPot(supabase, user.id, league, 'pickem'),
  ]);

  return (
    <main>
      <AppBar
        title={`Week ${week}`}
        subtitle={league.name}
        trailing={<LeagueSwitcher leagues={leagues} currentId={league.id} />}
        below={<WeekSelector week={week} />}
      />

      {!data.challenge ? (
        <EmptyState
          title={`Week ${week} isn't open yet`}
          body="Contests open automatically once the schedule for the week is published."
        />
      ) : (
        <PickSheet
          challengeId={data.challenge.id}
          lockTime={data.challenge.lock_time}
          enabledMarkets={data.challenge.enabled_markets}
          games={data.games}
          oddsByGame={data.oddsByGame}
          existingPicks={data.myPicks}
        />
      )}

      {/* The pot and the room belong to this mode, beneath the game rather than
          in front of it. */}
      <div className="mt-5 space-y-2">
        <ModePot pot={pot} leagueId={league.id} season={league.season} />
        <ModeChatButton leagueId={league.id} mode="pickem" label="Pick'em" />
      </div>
    </main>
  );
}
