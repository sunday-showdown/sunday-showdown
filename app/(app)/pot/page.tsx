import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues } from '@/lib/week';
import PotPanel, { type PotMember } from '@/components/PotPanel';
import EmptyState from '@/components/EmptyState';

export const metadata = { title: 'Pot' };
export const dynamic = 'force-dynamic';

export default async function PotPage({
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
        body="A pot belongs to a league."
        action={<Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">Create a league</Link>}
      />
    );
  }

  const league = leagues.find((l) => l.id === params.league) ?? leagues[0]!;

  const { data: pot } = await supabase
    .from('pots')
    .select('id, buy_in, confirmed_pool, projected_pool, owner_id')
    .eq('league_id', league.id)
    .eq('season', league.season)
    .maybeSingle();

  const { data: memberRows } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', league.id);

  const memberIds = (memberRows ?? []).map((m) => m.user_id as string);

  const [{ data: profiles }, { data: participants }] = await Promise.all([
    memberIds.length
      ? supabase.from('profiles').select('user_id, username').in('user_id', memberIds)
      : Promise.resolve({ data: [] as { user_id: string; username: string }[] }),
    pot
      ? supabase.from('pot_participants').select('user_id, paid').eq('pot_id', pot.id)
      : Promise.resolve({ data: [] as { user_id: string; paid: boolean }[] }),
  ]);

  const paidSet = new Set((participants ?? []).filter((p) => p.paid).map((p) => p.user_id as string));

  const members: PotMember[] = (profiles ?? [])
    .map((p) => ({
      userId: p.user_id as string,
      username: p.username as string,
      paid: paidSet.has(p.user_id as string),
    }))
    .sort((a, b) => a.username.localeCompare(b.username));

  return (
    <main className="pb-4">
      <header className="px-4 pb-3 pt-3 safe-top">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Pot</h1>
        <p className="text-xs text-muted">{league.name} · {league.season}</p>
      </header>

      <PotPanel
        potId={(pot?.id as string) ?? null}
        leagueId={league.id}
        season={league.season}
        buyIn={Math.round(Number(pot?.buy_in ?? 0))}
        confirmed={Math.round(Number(pot?.confirmed_pool ?? 0))}
        projected={Math.round(Number(pot?.projected_pool ?? 0))}
        members={members}
        isOwner={pot ? pot.owner_id === user.id : false}
      />
    </main>
  );
}
