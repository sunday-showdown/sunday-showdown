import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues, loadWeek } from '@/lib/week';
import PickSheet from '@/components/PickSheet';
import WeekSelector from '@/components/WeekSelector';
import EmptyState from '@/components/EmptyState';

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
      <EmptyState
        title="No league yet"
        body="Create one and invite your friends, or join with an invite code."
        action={
          <Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">
            Create a league
          </Link>
        }
      />
    );
  }

  const league = leagues.find((l) => l.id === params.league) ?? leagues[0]!;
  const requested = Number(params.week);
  const week =
    Number.isInteger(requested) && requested >= 1 && requested <= 18
      ? requested
      : league.current_week;

  const data = await loadWeek(supabase, user.id, league, week);

  return (
    <main>
      <header className="flex items-center justify-between px-4 pb-1 pt-3 safe-top">
        <div>
          <h1 className="display text-[28px] leading-none">Week {week}</h1>
          <p className="text-xs text-muted">{league.name}</p>
        </div>
        {leagues.length > 1 && (
          <Link
            href={`/picks?week=${week}&league=${leagues[(leagues.indexOf(league) + 1) % leagues.length]!.id}`}
            className="btn-ghost h-9 px-3 text-xs"
          >
            Switch league
          </Link>
        )}
      </header>

      <WeekSelector week={week} />

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
    </main>
  );
}
