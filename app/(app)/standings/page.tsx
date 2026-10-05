import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues } from '@/lib/week';
import { loadSeasonStandings } from '@/lib/standings';
import LeagueSwitcher from '@/components/LeagueSwitcher';
import EmptyState from '@/components/EmptyState';

export const metadata = { title: 'Standings' };
export const dynamic = 'force-dynamic';

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const user = (await getSessionUser())!;
  const params = await searchParams;
  const supabase = await createServerSupabase();

  const leagues = await loadMyLeagues(supabase, user.id);
  if (leagues.length === 0) {
    return (
      <EmptyState
        title="No league yet"
        body="Standings appear once you're in a league and a week has been graded."
        action={
          <Link href="/leagues/new" className="btn-primary px-5 text-sm">
            Create a league
          </Link>
        }
      />
    );
  }

  const league = leagues.find((l) => l.id === params.league) ?? leagues[0]!;
  const rows = await loadSeasonStandings(supabase, league.id, league.season);
  const leader = rows[0];

  return (
    <main className="pb-6">
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-3">
        <div className="min-w-0">
          <h1 className="display text-[28px] leading-none">Standings</h1>
          <p className="truncate text-[11px] text-muted">
            {league.name} · {league.season}
          </p>
        </div>
        <LeagueSwitcher leagues={leagues} currentId={league.id} />
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing graded yet"
          body="Standings fill in automatically once the first week's games are final."
        />
      ) : (
        <>
          {/* The leader gets the podium treatment — someone is winning, and the
              table should say so before you read a single row. */}
          {leader && (
            <section className="px-4">
              <div className="card card-hot flex items-center gap-4 px-4 py-4">
                <span className="display flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold/15 text-[26px] text-gold">
                  1
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
                    Top of the table
                  </div>
                  <div className="display truncate text-[24px] leading-none">{leader.username}</div>
                  <div className="mt-1 text-[11px] text-muted">
                    {leader.weeklyWins > 0
                      ? `${leader.weeklyWins} week${leader.weeklyWins === 1 ? '' : 's'} won`
                      : `${leader.weeksPlayed} week${leader.weeksPlayed === 1 ? '' : 's'} played`}
                  </div>
                </div>
                <span className="display text-glow shrink-0 text-[30px] leading-none tabnum text-brand">
                  {Math.round(leader.totalPoints)}
                </span>
              </div>
            </section>
          )}

          <section className="mt-4 px-4">
            <h2 className="eyebrow pb-2">Full table</h2>
            <div className="card overflow-hidden">
              <ul className="divide-y divide-line/60">
                {rows.map((row) => {
                  const isMe = row.userId === user.id;
                  return (
                    <li
                      key={row.userId}
                      className={`flex items-center gap-3 px-3.5 py-3 ${
                        isMe ? 'bg-brand/[0.07]' : ''
                      }`}
                    >
                      <span
                        className={`display w-7 shrink-0 text-center text-[17px] leading-none tabnum ${
                          row.rank === 1 ? 'text-gold' : 'text-muted'
                        }`}
                      >
                        {row.rank}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-bold">{row.username}</span>
                          {isMe && <span className="chip bg-brand/15 text-brand">You</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] tabnum text-muted">
                          <span>{row.correctMl} ML</span>
                          <span>·</span>
                          <span>{row.correctSpread} SPR</span>
                          <span>·</span>
                          <span>{row.correctTotals} O/U</span>
                          {row.weeklyWins > 0 && (
                            <>
                              <span>·</span>
                              <span className="font-bold text-gold">{row.weeklyWins}×W</span>
                            </>
                          )}
                        </div>
                      </div>

                      <span className="display shrink-0 text-[22px] leading-none tabnum">
                        {Math.round(row.totalPoints)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="mt-2.5 px-1 text-[11px] leading-relaxed text-muted">
              Ties share a rank. Everyone tied at the top counts as that
              week&apos;s winner.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
