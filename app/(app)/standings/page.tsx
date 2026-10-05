import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues } from '@/lib/week';
import { loadSeasonStandings } from '@/lib/standings';
import EmptyState from '@/components/EmptyState';

export const metadata = { title: 'Standings' };

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
          <Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">
            Create a league
          </Link>
        }
      />
    );
  }

  const league = leagues.find((l) => l.id === params.league) ?? leagues[0]!;
  const rows = await loadSeasonStandings(supabase, league.id, league.season);

  return (
    <main>
      <header className="px-4 pb-2 pt-3">
        <h1 className="display text-[28px] leading-none">Standings</h1>
        <p className="text-xs text-muted">
          {league.name} · {league.season}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing graded yet"
          body="Standings fill in automatically once the first week's games are final."
        />
      ) : (
        <div className="px-4">
          <div className="card overflow-hidden">
            <div className="grid grid-cols-[2rem_1fr_3rem_3.5rem] items-center gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Wks</span>
              <span className="text-right">Pts</span>
            </div>

            <ul className="divide-y divide-line/70">
              {rows.map((row) => {
                const isMe = row.userId === user.id;
                return (
                  <li
                    key={row.userId}
                    className={`grid grid-cols-[2rem_1fr_3rem_3.5rem] items-center gap-2 px-3 py-3 ${
                      isMe ? 'bg-brand/5' : ''
                    }`}
                  >
                    <span
                      className={`display text-[15px] leading-none tabnum ${
                        row.rank === 1 ? 'text-brand' : 'text-muted'
                      }`}
                    >
                      {row.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {row.username}
                        {isMe && <span className="ml-1.5 text-[10px] text-brand">you</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted tabnum">
                        {row.correctMl} ML · {row.correctSpread} SP · {row.correctTotals} OU
                        {row.weeklyWins > 0 && (
                          <span className="text-brand"> · {row.weeklyWins}× week</span>
                        )}
                      </div>
                    </div>
                    <span className="text-right text-sm text-muted tabnum">{row.weeksPlayed}</span>
                    <span className="text-right display text-[19px] leading-none tabnum">
                      {row.totalPoints}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted">
            Ties share a rank. Everyone tied at the top of a week counts as that
            week&apos;s winner.
          </p>
        </div>
      )}
    </main>
  );
}
