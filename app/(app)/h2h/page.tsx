import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues } from '@/lib/week';
import { canonicalPair } from '@/lib/h2h';
import H2HPanel, { type Challenge, type LeagueMate } from '@/components/H2HPanel';
import EmptyState from '@/components/EmptyState';

export const metadata = { title: 'Head to head' };
export const dynamic = 'force-dynamic';

export default async function H2HPage({
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
        body="Head to head needs someone to play against."
        action={<Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">Create a league</Link>}
      />
    );
  }

  const league = leagues.find((l) => l.id === params.league) ?? leagues[0]!;

  const [{ data: members }, { data: rows }, { data: records }] = await Promise.all([
    supabase.from('league_members').select('user_id').eq('league_id', league.id),
    supabase
      .from('h2h_challenges')
      .select('id, status, week, challenger_id, opponent_id, challenger_score, opponent_score, winner_id')
      .eq('league_id', league.id)
      .eq('season', league.season)
      .order('week', { ascending: false })
      .limit(40),
    supabase
      .from('h2h_records')
      .select('user_a_id, user_b_id, user_a_wins, user_b_wins, ties')
      .eq('league_id', league.id),
  ]);

  const otherIds = (members ?? []).map((m) => m.user_id as string).filter((id) => id !== user.id);

  const involvedIds = new Set<string>(otherIds);
  for (const row of rows ?? []) {
    involvedIds.add(row.challenger_id as string);
    involvedIds.add(row.opponent_id as string);
  }
  involvedIds.delete(user.id);

  const { data: profiles } = involvedIds.size
    ? await supabase.from('profiles').select('user_id, username').in('user_id', [...involvedIds])
    : { data: [] };

  const nameOf = new Map((profiles ?? []).map((p) => [p.user_id as string, p.username as string]));

  const challenges: Challenge[] = (rows ?? []).map((row) => {
    const iAmChallenger = row.challenger_id === user.id;
    const otherId = (iAmChallenger ? row.opponent_id : row.challenger_id) as string;
    return {
      id: row.id as string,
      status: row.status as string,
      week: row.week as number,
      opponentName: nameOf.get(otherId) ?? 'Someone',
      iAmChallenger,
      challengerScore: row.challenger_score === null ? null : Number(row.challenger_score),
      opponentScore: row.opponent_score === null ? null : Number(row.opponent_score),
      winnerId: (row.winner_id as string) ?? null,
      myId: user.id,
    };
  });

  // Lifetime record against each league mate, read from the canonical pair row.
  const recordFor = (otherId: string): string | null => {
    const { userA, userB, swapped } = canonicalPair(user.id, otherId);
    const row = (records ?? []).find((r) => r.user_a_id === userA && r.user_b_id === userB);
    if (!row) return null;
    const mine = swapped ? row.user_b_wins : row.user_a_wins;
    const theirs = swapped ? row.user_a_wins : row.user_b_wins;
    return row.ties > 0 ? `${mine}-${theirs}-${row.ties}` : `${mine}-${theirs}`;
  };

  const mates: LeagueMate[] = otherIds.map((id) => ({
    userId: id,
    username: nameOf.get(id) ?? 'Someone',
    record: recordFor(id),
  }));

  return (
    <main className="pb-4">
      <header className="px-4 pb-3 pt-3 safe-top">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Head to head</h1>
        <p className="text-xs text-muted">
          {league.name} · highest card wins the week
        </p>
      </header>

      <H2HPanel
        leagueId={league.id}
        season={league.season}
        week={league.current_week}
        challenges={challenges}
        mates={mates}
      />
    </main>
  );
}
