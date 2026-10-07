import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { loadDuels, roundsRemaining } from '@/lib/duels';
import { loadPot } from '@/lib/pot';
import DuelPanel from '@/components/DuelPanel';
import EmptyState from '@/components/EmptyState';
import AppBar from '@/components/AppBar';
import ModePot from '@/components/ModePot';
import ModeChatButton from '@/components/ModeChatButton';

export const metadata = { title: 'Duels' };
export const dynamic = 'force-dynamic';

export default async function H2HPage({
  searchParams,
}: {
  searchParams: Promise<{ duel?: string }>;
}) {
  const user = (await getSessionUser())!;
  const params = await searchParams;
  const supabase = await createServerSupabase();

  // No switcher on this screen: a duel can be against anybody, so asking which
  // league you are "in" to look at your fights was a question with no bearing on
  // the answer. The active league still decides the season and the week, which
  // is all the arena needs from it.
  const { leagues, league } = await resolveLeague(supabase, user.id);

  // A duel is played with your Pick'em card, so it needs a league to read one
  // from — but only your own. Who you may fight is a separate question, answered
  // by friendship.
  if (!league) {
    return (
      <main>
        <AppBar title="Duels" back="/home" />
        <EmptyState
          title="No card to fight with"
          body="A duel is settled on your Pick'em card, so you need a league to play one in. Your opponent does not have to be in it."
          action={
            <Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">
              Create a league
            </Link>
          }
        />
      </main>
    );
  }

  const [view, pot] = await Promise.all([
    loadDuels(supabase, user.id, league.season, leagues),
    loadPot(supabase, user.id, { leagueId: league.id, season: league.season }, 'h2h'),
  ]);

  const roundsLeftFor = Object.fromEntries(
    view.duels.map((duel) => [duel.id, roundsRemaining(duel, league.current_week)]),
  );

  const openCount = view.incoming.length + view.live.length;

  return (
    <main className="pb-4">
      <AppBar
        title="Duels"
        subtitle={
          openCount > 0
            ? `${openCount} fight${openCount === 1 ? '' : 's'} on`
            : 'Call out a friend or a league mate'
        }
        back="/home"
      />

      <DuelPanel
        view={view}
        currentWeek={league.current_week}
        roundsLeftFor={roundsLeftFor}
        openDuelId={params.duel ?? null}
      />

      <div className="mt-5 space-y-2">
        <ModePot pot={pot} leagueId={league.id} season={league.season} />
        <ModeChatButton leagueId={league.id} mode="h2h" label="Head to head" />
      </div>
    </main>
  );
}
