import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { loadDashboard } from '@/lib/dashboard';
import { loadActiveModes, urgentCount } from '@/lib/modes';
import { loadRecap } from '@/lib/recap';
import { loadWeek } from '@/lib/week';
import { cardLockState } from '@/lib/contest';
import { formatCountdown, formatKickoff, describePick } from '@/lib/format';
import { pointsForOdds } from '@/lib/odds';
import EmptyState from '@/components/EmptyState';
import ModesHub from '@/components/ModesHub';
import ActiveModes from '@/components/ActiveModes';
import RecapBanner from '@/components/RecapBanner';
import NotificationBell from '@/components/NotificationBell';
import AppBar from '@/components/AppBar';
import LeagueCards from '@/components/LeagueCards';

export const metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

/**
 * The hub.
 *
 * Order is by what somebody opens the app to find out, which changes through the
 * week: last week's result on a Tuesday, then the card and its countdown, then
 * everything else they are in, and only then the grid of modes they could start.
 *
 * The previous version put the card itself at the very bottom, below a grid of
 * nine links — so the one thing with a deadline was the last thing on the screen
 * and it did not say which league it belonged to.
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

  const { cards, liveGames } = dashboard;

  const week = await loadWeek(supabase, user.id, league, league.current_week);

  // Same policy-aware check the pick sheet uses, so the hero on Home and the
  // card itself cannot disagree about whether there is anything left to do.
  const lockState = cardLockState(
    week.games.map((game) => game.start_time),
    week.challenge?.lock_time ?? null,
    league.lock_policy,
  );
  const locked = lockState.allLocked;
  const picked = week.myPicks.length;
  const total = week.games.length;
  const complete = total > 0 && picked >= total;
  const nextGame = week.games.find((g) => g.status === 'scheduled');

  // Everything else this person is in, across every league and pool, and last
  // week's result. Both are per-league reads that Home already has the inputs
  // for, so they go out together.
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

  const oddsFor = (pick: { game_id: string; market_type: string; selection: string }) =>
    (week.oddsByGame[pick.game_id] ?? []).find(
      (o) => o.market_type === pick.market_type && o.selection === pick.selection,
    )?.american_odds ?? null;

  const atStake = week.myPicks.reduce((sum, pick) => sum + pointsForOdds(oddsFor(pick)), 0);

  // What is left to do across every league, which is the question the top of
  // this screen exists to answer. Only the things with a deadline count — see
  // urgentCount.
  const outstanding = urgentCount(activeModes);

  // The hero's own call to action. The previous version read "Finish your card"
  // whenever a single pick existed, including on a card with every game in.
  const heroLabel = locked
    ? 'Review your card'
    : complete
      ? 'Change your picks'
      : picked === 0
        ? 'Make your picks'
        : 'Finish your card';

  const heroTitle = locked
    ? 'Card locked'
    : complete
      ? 'Card complete'
      : picked === 0
        ? 'Make your picks'
        : `${picked} of ${total} in`;

  return (
    <main className="pb-6">
      <AppBar
        title={username}
        subtitle={
          outstanding > 0
            ? `${outstanding} thing${outstanding === 1 ? '' : 's'} need${outstanding === 1 ? 's' : ''} you`
            : 'All set'
        }
        trailing={<NotificationBell />}
      />

      {/* Tuesday first. Once a week is graded there is nothing live and the next
          lock is days off, so the result is the news. */}
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

      {/* The card, and which league it is for — the complaint about the old
          layout was not being able to tell. */}
      <section className="px-4">
        <div className={`card overflow-hidden p-4 ${locked || complete ? '' : 'card-hot'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow">
                Week {league.current_week} · {league.name}
              </div>
              <div className="display mt-1.5 text-[34px] leading-[0.95]">{heroTitle}</div>
            </div>

            {!locked && week.challenge && (
              <div className="shrink-0 text-right">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
                  {league.lock_policy === 'per_game' ? 'Next locks' : 'Locks in'}
                </div>
                <div className="display text-glow text-[26px] leading-none tabnum text-brand">
                  {lockState.nextLockAt
                    ? formatCountdown(lockState.nextLockAt.getTime() - Date.now())
                    : '—'}
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

          {/* The card itself, as a strip rather than sixteen rows at the foot of
              the page. Scrollable, so it costs no height. */}
          {week.myPicks.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4">
              {week.myPicks.map((pick) => {
                const game = week.games.find((g) => g.id === pick.game_id);
                if (!game) return null;
                const line = (week.oddsByGame[game.id] ?? []).find(
                  (o) => o.market_type === pick.market_type && o.selection === pick.selection,
                );

                return (
                  <div
                    key={pick.game_id}
                    className="shrink-0 rounded-xl bg-raised/80 px-2.5 py-1.5"
                  >
                    <div className="text-[12px] font-bold leading-none">
                      {describePick(pick.market_type, pick.selection, game, line?.line, 'short')}
                    </div>
                    <div className="mt-1 text-[9px] font-bold leading-none text-brand tabnum">
                      +{pointsForOdds(line?.american_odds ?? null)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Link
            href={liveGames.length > 0 ? '/live' : '/picks'}
            className={`${locked ? 'btn-ghost' : 'btn-primary'} mt-4 w-full text-[15px]`}
          >
            {liveGames.length > 0 ? 'Watch it live' : heroLabel}
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

      {/* Every mode you are actually in — pools, duels, buy-ins — not a menu. */}
      <ActiveModes modes={activeModes} />

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
    </main>
  );
}
