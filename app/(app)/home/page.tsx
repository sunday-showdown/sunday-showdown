import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { loadDashboard } from '@/lib/dashboard';
import { loadWeek } from '@/lib/week';
import { isCardLocked, timeUntilLock } from '@/lib/contest';
import { formatCountdown, formatKickoff, describePick } from '@/lib/format';
import { pointsForOdds } from '@/lib/odds';
import EmptyState from '@/components/EmptyState';
import ModesHub from '@/components/ModesHub';
import NotificationBell from '@/components/NotificationBell';
import AppBar from '@/components/AppBar';
import LeagueCards from '@/components/LeagueCards';

export const metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

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
        <AppBar title={username} subtitle="Welcome back" trailing={<NotificationBell />} />
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

  const week = await loadWeek(supabase, user.id, league, league.current_week);

  const locked = isCardLocked(week.challenge?.lock_time ?? null);
  const picked = week.myPicks.length;
  const total = week.games.length;
  const nextGame = week.games.find((g) => g.status === 'scheduled');
  const { liveGames, cards } = dashboard;

  const oddsFor = (pick: { game_id: string; market_type: string; selection: string }) =>
    (week.oddsByGame[pick.game_id] ?? []).find(
      (o) => o.market_type === pick.market_type && o.selection === pick.selection,
    )?.american_odds ?? null;

  const atStake = week.myPicks.reduce((sum, pick) => sum + pointsForOdds(oddsFor(pick)), 0);

  // What is left to do across every league, which is the question the top of
  // this screen exists to answer.
  const outstanding = cards.filter(
    (card) => card.slate > 0 && card.picked < card.slate && card.lockTime !== null &&
      new Date(card.lockTime).getTime() > Date.now(),
  ).length;

  return (
    <main className="pb-6">
      <AppBar
        title={username}
        subtitle={
          outstanding > 0
            ? `${outstanding} card${outstanding === 1 ? '' : 's'} still open`
            : 'Welcome back'
        }
        trailing={<NotificationBell />}
      />

      {/* The one thing that matters right now, in the league you are in, sized
          like it. */}
      <section className="px-4">
        <div className={`card overflow-hidden p-4 ${locked ? '' : 'card-hot'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow">
                Week {league.current_week} · {league.name}
              </div>
              <div className="display mt-1.5 text-[34px] leading-[0.95]">
                {locked
                  ? 'Card locked'
                  : picked === 0
                    ? 'Make your picks'
                    : `${picked} of ${total} in`}
              </div>
            </div>

            {!locked && week.challenge && (
              <div className="shrink-0 text-right">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
                  Locks in
                </div>
                <div className="display text-glow text-[26px] leading-none tabnum text-brand">
                  {formatCountdown(timeUntilLock(week.challenge.lock_time))}
                </div>
              </div>
            )}
          </div>

          {picked > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-500"
                  style={{ width: `${total > 0 ? (picked / total) * 100 : 0}%` }}
                />
              </div>
              <span className="display text-[15px] leading-none tabnum text-brand">{atStake}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                to win
              </span>
            </div>
          )}

          <Link
            href={liveGames.length > 0 ? '/live' : '/picks'}
            className={`${locked ? 'btn-ghost' : 'btn-primary'} mt-4 w-full text-[15px]`}
          >
            {liveGames.length > 0
              ? 'Watch it live'
              : locked
                ? 'Review your card'
                : picked === 0
                  ? 'Make your picks'
                  : 'Finish your card'}
          </Link>
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

      {liveGames.length === 0 && nextGame && (
        <section className="mt-4 px-4">
          <div className="card flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
                Up next
              </div>
              <div className="display mt-0.5 text-[17px] leading-none">
                {nextGame.away_abbr} <span className="text-muted">at</span> {nextGame.home_abbr}
              </div>
            </div>
            <span className="text-xs font-semibold text-muted">
              {formatKickoff(nextGame.start_time)}
            </span>
          </div>
        </section>
      )}

      {/* Every league, not just the active one. Tapping switches. */}
      <section className="mt-5">
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="eyebrow">{cards.length > 1 ? 'Your leagues' : 'Your league'}</h2>
          <Link href="/leagues" className="text-[11px] font-bold text-brand">
            Manage →
          </Link>
        </div>
        <LeagueCards cards={cards} activeId={league.id} />
      </section>

      <ModesHub />

      {week.myPicks.length > 0 && (
        <section className="mt-5">
          <h2 className="eyebrow px-4 pb-2">This week&apos;s card</h2>
          <div className="space-y-2 px-4">
            {week.myPicks.map((pick) => {
              const game = week.games.find((g) => g.id === pick.game_id);
              if (!game) return null;
              const line = (week.oddsByGame[game.id] ?? []).find(
                (o) => o.market_type === pick.market_type && o.selection === pick.selection,
              );

              return (
                <div
                  key={pick.game_id}
                  className="card flex items-center justify-between px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
                      {pick.market_type} · {game.away_abbr} at {game.home_abbr}
                    </div>
                    <div className="mt-0.5 truncate text-[15px] font-bold">
                      {describePick(pick.market_type, pick.selection, game, line?.line)}
                    </div>
                  </div>
                  <span className="display shrink-0 text-[19px] leading-none tabnum text-brand">
                    {pointsForOdds(line?.american_odds ?? null)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
