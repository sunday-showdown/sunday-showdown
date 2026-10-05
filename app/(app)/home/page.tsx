import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues, loadWeek } from '@/lib/week';
import { loadSeasonStandings } from '@/lib/standings';
import { isCardLocked, timeUntilLock } from '@/lib/contest';
import { formatCountdown, formatKickoff, formatSpread } from '@/lib/format';
import { pointsForOdds } from '@/lib/odds';
import EmptyState from '@/components/EmptyState';

export const metadata = { title: 'Home' };

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
          body="Create a league and share the invite code, or join one a friend already set up."
          action={
            <div className="flex flex-col gap-2">
              <Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">
                Create a league
              </Link>
              <Link href="/leagues/join" className="btn-ghost h-11 px-5 text-sm">
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

  // Each pick is worth its own price, so the total has to be read from the
  // odds rather than a per-market constant.
  const oddsFor = (pick: { game_id: string; market_type: string; selection: string }) =>
    (week.oddsByGame[pick.game_id] ?? []).find(
      (o) => o.market_type === pick.market_type && o.selection === pick.selection,
    )?.american_odds ?? null;

  const pickedPoints = week.myPicks.reduce((sum, pick) => sum + pointsForOdds(oddsFor(pick)), 0);

  return (
    <main className="pb-4">
      <Greeting username={username} />

      <section className="px-4">
        <div className="card p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Week {league.current_week} · {league.name}
              </div>
              <div className="font-display mt-1 text-2xl font-extrabold tracking-tight">
                {locked ? 'Card locked' : `${picked} of ${total} picked`}
              </div>
            </div>
            {!locked && week.challenge && (
              <div className="text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Locks in
                </div>
                <div className="font-display text-lg font-extrabold tabnum text-brand">
                  {formatCountdown(timeUntilLock(week.challenge.lock_time))}
                </div>
              </div>
            )}
          </div>

          {!locked && picked < total && (
            <p className="mt-2 text-sm text-muted">
              {total - picked} game{total - picked === 1 ? '' : 's'} still open.
            </p>
          )}
          {locked && (
            <p className="mt-2 text-sm text-muted">
              {pickedPoints} points on the line this week.
            </p>
          )}

          <Link
            href="/picks"
            className={`${locked ? 'btn-ghost' : 'btn-primary'} mt-4 h-12 w-full text-sm`}
          >
            {locked ? 'Review your card' : picked === 0 ? 'Make your picks' : 'Finish your card'}
          </Link>
        </div>
      </section>

      {liveGames.length > 0 && (
        <section className="mt-5">
          <h2 className="px-4 pb-2 font-display text-sm font-bold uppercase tracking-wide text-muted">
            Live now
          </h2>
          <div className="space-y-2 px-4">
            {liveGames.map((game) => (
              <div key={game.id} className="card flex items-center justify-between px-4 py-3">
                <span className="text-sm font-semibold">
                  {game.away_abbr} @ {game.home_abbr}
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-live" />
                  <span className="font-display text-base font-extrabold tabnum">
                    {game.away_score ?? 0}–{game.home_score ?? 0}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {liveGames.length === 0 && nextGame && (
        <section className="mt-5 px-4">
          <div className="card flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Up next
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {nextGame.away_abbr} @ {nextGame.home_abbr}
              </div>
            </div>
            <span className="text-sm text-muted">{formatKickoff(nextGame.start_time)}</span>
          </div>
        </section>
      )}

      {me && (
        <section className="mt-5 px-4">
          <div className="card flex items-center justify-between px-4 py-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Your season
              </div>
              <div className="font-display mt-0.5 text-xl font-extrabold tabnum">
                {me.totalPoints} pts
                <span className="ml-2 text-sm font-bold text-muted">
                  #{me.rank} of {standings.length}
                </span>
              </div>
            </div>
            <Link href="/standings" className="btn-ghost h-9 px-3 text-xs">
              Standings
            </Link>
          </div>
        </section>
      )}

      {week.myPicks.length > 0 && (
        <section className="mt-5">
          <h2 className="px-4 pb-2 font-display text-sm font-bold uppercase tracking-wide text-muted">
            This week&apos;s card
          </h2>
          <div className="space-y-2 px-4">
            {week.myPicks.map((pick) => {
              const game = week.games.find((g) => g.id === pick.game_id);
              if (!game) return null;
              const line = (week.oddsByGame[game.id] ?? []).find(
                (o) => o.market_type === pick.market_type && o.selection === pick.selection,
              );

              return (
                <div key={pick.game_id} className="card flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {pick.market_type} ·{' '}
                      <span className="text-brand">+{pointsForOdds(line?.american_odds ?? null)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold">
                      {describePick(pick, game, line?.line ?? null)}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {game.away_abbr}@{game.home_abbr}
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
    <header className="px-4 pb-3 pt-3 safe-top">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">
        Hey, {username}
      </h1>
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
