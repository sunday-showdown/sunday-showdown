import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues } from '@/lib/week';
import EmptyState from '@/components/EmptyState';
import AppBar from '@/components/AppBar';
import LeagueBadge from '@/components/LeagueBadge';

export const metadata = { title: 'Leagues' };
export const dynamic = 'force-dynamic';

export default async function LeaguesPage() {
  const user = (await getSessionUser())!;
  const supabase = await createServerSupabase();
  const leagues = await loadMyLeagues(supabase, user.id);

  return (
    <main className="pb-6">
      <AppBar title="Leagues" subtitle="Members, invite codes and settings" back="/home" />

      {leagues.length === 0 ? (
        <EmptyState
          title="No leagues yet"
          body="Create one and share the code, or join one with a friend's."
          action={
            <div className="flex flex-col gap-2">
              <Link href="/leagues/new" className="btn-primary px-5 text-sm">Create a league</Link>
              <Link href="/leagues/join" className="btn-ghost px-5 text-sm">Join with a code</Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="space-y-2 px-4">
            {leagues.map((league) => (
              <Link
                key={league.id}
                href={`/leagues/${league.id}`}
                className="card flex items-center gap-3.5 px-4 py-3.5"
              >
                <LeagueBadge name={league.name} url={league.avatar_url} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="display truncate text-[19px] leading-none">{league.name}</div>
                  <div className="mt-1 text-[11px] text-muted">
                    {league.season} · week {league.current_week}
                    {league.commissioner_id === user.id && (
                      <span className="text-brand"> · commissioner</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-muted">›</span>
              </Link>
            ))}
          </div>

          <div className="mt-4 flex gap-2 px-4">
            <Link href="/leagues/new" className="btn-ghost flex-1 text-sm">New league</Link>
            <Link href="/leagues/join" className="btn-ghost flex-1 text-sm">Join one</Link>
          </div>
        </>
      )}
    </main>
  );
}
