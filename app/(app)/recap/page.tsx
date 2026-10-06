import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { loadRecap } from '@/lib/recap';
import { formatOdds } from '@/lib/format';
import AppBar from '@/components/AppBar';
import EmptyState from '@/components/EmptyState';
import LeagueSwitcher from '@/components/LeagueSwitcher';

export const metadata = { title: 'Week recap' };
export const dynamic = 'force-dynamic';

/**
 * How the week went.
 *
 * The missing half of a pick'em week: the app had a lot to say before kickoff
 * and nothing on Tuesday morning. Everything here was written by grading — this
 * screen reads, it never scores. See lib/recap.ts.
 */
export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; league?: string }>;
}) {
  const user = (await getSessionUser())!;
  const params = await searchParams;
  const supabase = await createServerSupabase();

  const { leagues, league } = await resolveLeague(supabase, user.id, params.league);
  if (!league) {
    return (
      <main>
        <AppBar title="Recap" back="/home" />
        <EmptyState title="No league yet" body="Join or create one and your weeks will show up here." />
      </main>
    );
  }

  // Defaults to the week just gone, because that is the one with results in it.
  const requested = Number(params.week);
  const week =
    Number.isFinite(requested) && requested >= 1 && requested <= 18
      ? Math.floor(requested)
      : Math.max(1, league.current_week - 1);

  const recap = await loadRecap(supabase, user.id, league, week);
  const { summary } = recap;

  const previous = week > 1 ? week - 1 : null;
  const next = week < league.current_week ? week + 1 : null;

  return (
    <main className="pb-6">
      <AppBar
        title={`Week ${week}`}
        subtitle={`${league.name} recap`}
        back="/home"
        trailing={<LeagueSwitcher leagues={leagues} currentId={league.id} />}
      />

      {!recap.graded ? (
        <EmptyState
          title="Not in yet"
          body={`Week ${week} has not been graded. Results land once the last game is final — usually Tuesday morning.`}
          action={
            <Link href="/picks" className="btn-primary h-11 px-5 text-sm">
              See your card
            </Link>
          }
        />
      ) : (
        <>
          <section className="px-4">
            <div className="card overflow-hidden p-4">
              <div className="eyebrow">How it went</div>
              <h1 className="display mt-1.5 text-balance text-[28px] leading-[1.02]">
                {recap.headline}
              </h1>

              <div className="mt-4 grid grid-cols-4 gap-2">
                <Stat label="Points" value={String(summary.points)} tone="text-brand" />
                <Stat
                  label="Record"
                  value={`${summary.wins}-${summary.losses}${summary.pushes > 0 ? `-${summary.pushes}` : ''}`}
                />
                <Stat
                  label="Hit rate"
                  value={summary.hitRate === null ? '—' : `${Math.round(summary.hitRate * 100)}%`}
                />
                <Stat
                  label="Place"
                  value={recap.rank === null ? '—' : String(recap.rank)}
                  suffix={recap.fieldSize > 0 ? `/${recap.fieldSize}` : undefined}
                  tone={recap.rank === 1 ? 'text-gold' : 'text-ink'}
                />
              </div>

              {recap.weekWinner && !recap.isWinner && (
                <p className="mt-3 border-t border-line/70 pt-3 text-[12px] text-muted">
                  <span className="font-bold text-ink">{recap.weekWinner.username}</span> took the
                  week with {recap.weekWinner.points}.
                </p>
              )}
            </div>
          </section>

          {/* The two picks anyone actually wants to talk about. */}
          {(summary.best || summary.worst) && (
            <section className="mt-4 grid grid-cols-2 gap-2 px-4">
              {summary.best && (
                <div className="card px-3.5 py-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-win">
                    Best call
                  </div>
                  <div className="mt-1 truncate text-[14px] font-bold">{summary.best.label}</div>
                  <div className="mt-0.5 text-[10px] text-muted">{summary.best.matchup}</div>
                  <div className="display mt-1.5 text-[20px] leading-none tabnum text-win">
                    +{Math.round(summary.best.points)}
                  </div>
                </div>
              )}
              {summary.worst && (
                <div className="card px-3.5 py-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
                    One that hurt
                  </div>
                  <div className="mt-1 truncate text-[14px] font-bold">{summary.worst.label}</div>
                  <div className="mt-0.5 text-[10px] text-muted">{summary.worst.matchup}</div>
                  <div className="display mt-1.5 text-[20px] leading-none tabnum text-loss">
                    −{Math.round(summary.worst.atStake)}
                  </div>
                </div>
              )}
            </section>
          )}

          {recap.duels.length > 0 && (
            <section className="mt-5">
              <div className="flex items-center justify-between px-4 pb-2">
                <h2 className="eyebrow">Duels</h2>
                <Link href="/h2h" className="text-[11px] font-bold text-brand">
                  Arena →
                </Link>
              </div>
              <div className="space-y-2 px-4">
                {recap.duels.map((duel) => (
                  <div key={duel.id} className="card flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-bold">{duel.opponentName}</div>
                      <div className="text-[10px] text-muted">
                        {Math.round(duel.myPoints)} – {Math.round(duel.theirPoints)}
                        {duel.knockout ? ' · knockout' : ''}
                      </div>
                    </div>
                    <span
                      className={`chip ${
                        duel.drew
                          ? 'bg-push/20 text-push'
                          : duel.won
                            ? 'bg-win/15 text-win'
                            : 'bg-loss/15 text-loss'
                      }`}
                    >
                      {duel.drew ? 'Draw' : duel.won ? 'Won' : 'Lost'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(recap.survivor.length > 0 || recap.tdPoints > 0 || recap.tdHits.length > 0) && (
            <section className="mt-5 space-y-2 px-4">
              <h2 className="eyebrow pb-0.5">Other modes</h2>

              {recap.survivor.map((entry) => (
                <div
                  key={`${entry.poolName}-${entry.teamAbbr}`}
                  className="card flex items-center justify-between px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold">
                      {entry.teamAbbr} · {entry.poolName}
                    </div>
                    <div className="text-[10px] text-muted">Survivor</div>
                  </div>
                  <span
                    className={`chip ${
                      entry.result === 'survived'
                        ? 'bg-win/15 text-win'
                        : entry.result === 'eliminated'
                          ? 'bg-loss/15 text-loss'
                          : 'bg-push/20 text-push'
                    }`}
                  >
                    {entry.result === 'survived'
                      ? 'Survived'
                      : entry.result === 'eliminated'
                        ? 'Out'
                        : entry.result === 'push'
                          ? 'Tie'
                          : 'Pending'}
                  </span>
                </div>
              ))}

              {(recap.tdPoints > 0 || recap.tdHits.length > 0) && (
                <div className="card px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[14px] font-bold">TD Scorer</div>
                    <span className="display text-[18px] leading-none tabnum text-brand">
                      {recap.tdPoints}
                    </span>
                  </div>
                  {recap.tdHits.length > 0 && (
                    <div className="mt-1 text-[10px] text-muted">
                      {recap.tdHits.map((hit) => hit.playerName).join(', ')} found the end zone.
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          <section className="mt-5">
            <h2 className="eyebrow px-4 pb-2">Every pick</h2>
            <div className="space-y-2 px-4">
              {recap.picks.length === 0 && (
                <p className="text-sm text-muted">You did not pick this week.</p>
              )}
              {recap.picks.map((entry) => (
                <div
                  key={`${entry.gameId}-${entry.market}`}
                  className="card flex items-center justify-between px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
                      {entry.market} · {entry.matchup}
                      {entry.homeScore !== null && entry.awayScore !== null
                        ? ` · ${entry.awayScore}-${entry.homeScore}`
                        : ''}
                    </div>
                    <div className="mt-0.5 truncate text-[15px] font-bold">{entry.label}</div>
                  </div>
                  <div className="shrink-0 pl-3 text-right">
                    <div
                      className={`display text-[18px] leading-none tabnum ${
                        entry.result === 'win'
                          ? 'text-win'
                          : entry.result === 'loss'
                            ? 'text-loss'
                            : 'text-muted'
                      }`}
                    >
                      {entry.result === 'win'
                        ? `+${Math.round(entry.points)}`
                        : entry.result === 'push'
                          ? 'Push'
                          : entry.result === 'pending'
                            ? '—'
                            : '0'}
                    </div>
                    <div className="text-[10px] text-muted tabnum">{formatOdds(entry.odds)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <nav className="mt-6 flex items-center justify-between gap-2 px-4">
        {previous ? (
          <Link href={`/recap?week=${previous}`} className="btn-ghost h-10 flex-1 text-sm">
            ← Week {previous}
          </Link>
        ) : (
          <span className="flex-1" />
        )}
        {next ? (
          <Link href={`/recap?week=${next}`} className="btn-ghost h-10 flex-1 text-sm">
            Week {next} →
          </Link>
        ) : (
          <span className="flex-1" />
        )}
      </nav>
    </main>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone = 'text-ink',
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`display mt-0.5 text-[20px] leading-none tabnum ${tone}`}>
        {value}
        {suffix && <span className="text-[11px] text-muted">{suffix}</span>}
      </div>
    </div>
  );
}
