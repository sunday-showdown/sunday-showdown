import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { loadDashboard } from '@/lib/dashboard';
import { loadActiveModes, urgentCount } from '@/lib/modes';
import { loadRecap } from '@/lib/recap';
import { formatKickoff } from '@/lib/format';
import EmptyState from '@/components/EmptyState';
import ModesHub from '@/components/ModesHub';
import ActiveModes from '@/components/ActiveModes';
import RecapBanner from '@/components/RecapBanner';
import NotificationBell from '@/components/NotificationBell';
import AppBar from '@/components/AppBar';
import LeagueWeekCard from '@/components/LeagueWeekCard';

export const metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

/**
 * The hub.
 *
 * Every league at once. There used to be an "active" league with a full-size
 * hero and a smaller row for each of the others, so the active one appeared
 * twice and the rest could only be read by switching the whole app over to
 * them — which is a lot of work to answer "what do I still have to do", the
 * question this screen exists for. The cards stack now and nothing is active.
 */
export default async function HomePage() {
  const user = (await getSessionUser())!;
  const supabase = await createServerSupabase();

  const [{ league }, { dashboard }, profileResult] = await Promise.all([
    resolveLeague(supabase, user.id),
    loadDashboard(supabase, user.id),
    supabase.from('profiles').select('username').eq('user_id', user.id).maybeSingle(),
  ]);

  const username = (profileResult.data?.username as string | undefined) ?? 'there';

  if (!league) {
    return (
      <main>
        <AppBar title="Home" trailing={<NotificationBell />} />
        <EmptyState
          title="Start a league"
          body="Create one and share the code, or join one a friend already set up."
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

  const { cards, liveGames } = dashboard;

  // Sorted by what is about to close. With two leagues this is usually the same
  // order every week, but when one has locked and the other has not, the one
  // that still wants something belongs first.
  const ordered = [...cards].sort((a, b) => {
    const openness = (card: typeof a) => {
      if (card.slate === 0) return 2;
      const locked = card.lockTime !== null && new Date(card.lockTime).getTime() <= Date.now();
      if (locked) return 3;
      return card.picked >= card.slate ? 1 : 0;
    };
    return openness(a) - openness(b) || a.league.name.localeCompare(b.league.name);
  });

  const [activeModes, lastWeek] = await Promise.all([
    loadActiveModes(
      supabase,
      user.id,
      league.season,
      league.current_week,
      cards.map((card) => ({
        leagueId: card.league.id,
        leagueName: card.league.name,
        picked: card.picked,
        slate: card.slate,
        locked: card.lockTime !== null && new Date(card.lockTime).getTime() <= Date.now(),
      })),
    ),
    league.current_week > 1
      ? loadRecap(supabase, user.id, league, league.current_week - 1)
      : Promise.resolve(null),
  ]);

  // Pick'em has a card of its own above for every league, so repeating it in the
  // strip below would be the same information twice.
  const otherModes = activeModes.filter((mode) => mode.kind !== 'pickem');

  const outstanding = urgentCount(activeModes);

  return (
    <main className="pb-6">
      {/* Compact: a name set in 34px display type was the largest thing on the
          screen and the least useful. */}
      <AppBar
        title="Home"
        subtitle={outstanding > 0 ? `${outstanding} need${outstanding === 1 ? 's' : ''} you` : undefined}
        compact
        trailing={<NotificationBell />}
      />

      {lastWeek?.graded && (
        <section className="px-4 pb-3">
          <RecapBanner
            week={lastWeek.week}
            leagueName={league.name}
            headline={lastWeek.headline}
            points={lastWeek.summary.points}
            record={`${lastWeek.summary.wins}-${lastWeek.summary.losses}${
              lastWeek.summary.pushes > 0 ? `-${lastWeek.summary.pushes}` : ''
            }`}
            rank={lastWeek.rank}
            fieldSize={lastWeek.fieldSize}
            won={lastWeek.isWinner}
          />
        </section>
      )}

      <section className="px-4">
        <div className="flex items-center justify-between pb-2">
          <h2 className="eyebrow">{cards.length > 1 ? 'Your weeks' : 'This week'}</h2>
          <Link href="/leagues" className="text-[11px] font-bold text-brand">
            Leagues →
          </Link>
        </div>
        <div className="space-y-2">
          {ordered.map((card) => (
            <LeagueWeekCard key={card.league.id} card={card} />
          ))}
        </div>
      </section>

      {liveGames.length > 0 && (
        <section className="mt-5">
          <div className="flex items-center justify-between px-4 pb-2">
            <h2 className="eyebrow">
              <span className="flex items-center gap-1.5 text-live">
                <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-live" />
                Live now
              </span>
            </h2>
            <Link href="/live" className="text-[11px] font-bold text-brand">
              Track card →
            </Link>
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
            {liveGames.map((game) => (
              <div key={game.id} className="card w-[148px] shrink-0 px-3 py-2.5">
                <div className="flex items-center justify-between text-[13px] font-bold">
                  <span>{game.away_abbr}</span>
                  <span className="display tabnum">{game.away_score ?? 0}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[13px] font-bold">
                  <span>{game.home_abbr}</span>
                  <span className="display tabnum">{game.home_score ?? 0}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-live">
                  <span className="h-1 w-1 animate-pulse-live rounded-full bg-live" />
                  LIVE
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {liveGames.length === 0 && dashboard.nextGame && (
        <section className="mt-4 px-4">
          <div className="card flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
                Up next
              </div>
              <div className="display mt-0.5 text-[17px] leading-none">
                {dashboard.nextGame.away_abbr} <span className="text-muted">at</span>{' '}
                {dashboard.nextGame.home_abbr}
              </div>
            </div>
            <span className="text-xs font-semibold text-muted">
              {formatKickoff(dashboard.nextGame.start_time)}
            </span>
          </div>
        </section>
      )}

      <ActiveModes modes={otherModes} />

      <ModesHub />
    </main>
  );
}
