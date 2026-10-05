import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues, loadWeek } from '@/lib/week';
import { loadSeasonStandings } from '@/lib/standings';
import { isCardLocked, timeUntilLock } from '@/lib/contest';
import { formatCountdown, formatKickoff, formatSpread } from '@/lib/format';
import { pointsForOdds } from '@/lib/odds';
import EmptyState from '@/components/EmptyState';
import ModesHub from '@/components/ModesHub';
import NotificationBell from '@/components/NotificationBell';

export const metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = (await getSessionUser())!;
  const supabase = await createServerSupabase();

  const [leagues, profileResult] = await Promise.all([
    loadMyLeagues(supabase, user.id),
    supabase.from('profiles').select('username').eq('user_id', user.id).maybeSingle(),
  ]);

  const username = (profileResult.data?.username as string | undefined) ?? 'there';

  if (leagues.length === 0) {
    return (
      <main>
        <Greeting username={username} />
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

  const league = leagues[0]!;
  const [week, standings] = await Promise.all([
    loadWeek(supabase, user.id, league, league.current_week),
    loadSeasonStandings(supabase, league.id, league.season),
  ]);

  const locked = isCardLocked(week.challenge?.lock_time ?? null);
  const picked = week.myPicks.length;
  const total = week.games.length;
  const me = standings.find((s) => s.userId === user.id);

  const liveGames = week.games.filter((g) => g.status === 'in_progress');
  const nextGame = week.games.find((g) => g.status === 'scheduled');

  const oddsFor = (pick: { game_id: string; market_type: string; selection: string }) =>
    (week.oddsByGame[pick.game_id] ?? []).find(
      (o) => o.market_type === pick.market_type && o.selection === pick.selection,
    )?.american_odds ?? null;

  const atStake = week.myPicks.reduce((sum, pick) => sum + pointsForOdds(oddsFor(pick)), 0);

  return (
    <main className="pb-6">
      <Greeting username={username} />

      {/* The one thing that matters right now, sized like it. */}
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

      {me && (
        <section className="mt-4 px-4">
          <Link href="/standings" className="card flex items-center justify-between px-4 py-3.5">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
                Your season
              </div>
              <div className="display mt-0.5 flex items-baseline gap-2 text-[26px] leading-none">
                {Math.round(me.totalPoints)}
                <span className="text-[13px] text-muted">pts</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
                  Rank
                </div>
                <div
                  className={`display text-[26px] leading-none tabnum ${
                    me.rank === 1 ? 'text-gold' : 'text-ink'
                  }`}
                >
                  {me.rank}
                  <span className="text-[13px] text-muted">/{standings.length}</span>
                </div>
              </div>
              <span className="text-muted">›</span>
            </div>
          </Link>
        </section>
      )}

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
                      {describePick(pick, game, line?.line ?? null)}
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

function Greeting({ username }: { username: string }) {
  return (
    <header className="flex items-center justify-between px-4 pb-3 pt-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-muted">Welcome back</div>
        <h1 className="display truncate text-[26px] leading-none">{username}</h1>
      </div>
      <NotificationBell />
    </header>
  );
}

function describePick(
  pick: { market_type: string; selection: string },
  game: { home_abbr: string; away_abbr: string },
  line: number | null,
): string {
  const abbr = pick.selection === 'home' ? game.home_abbr : game.away_abbr;
  if (pick.market_type === 'moneyline') return `${abbr} to win`;
  if (pick.market_type === 'spread') return `${abbr} ${formatSpread(line)}`;
  return `${pick.selection === 'over' ? 'Over' : 'Under'} ${line ?? ''}`.trim();
}
