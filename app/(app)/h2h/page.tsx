import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { canonicalPair } from '@/lib/h2h';
import { loadPot } from '@/lib/pot';
import H2HPanel, { type Challenge, type LeagueMate } from '@/components/H2HPanel';
import EmptyState from '@/components/EmptyState';
import AppBar from '@/components/AppBar';
import LeagueSwitcher from '@/components/LeagueSwitcher';
import ModePot from '@/components/ModePot';
import ModeChatButton from '@/components/ModeChatButton';

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

  const { leagues, league } = await resolveLeague(supabase, user.id, params.league);
  if (!league) {
    return (
      <main>
        <AppBar title="Head to head" back="/home" />
        <EmptyState
          title="No league yet"
          body="Head to head needs someone to play against."
          action={<Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">Create a league</Link>}
        />
      </main>
    );
  }


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

  const pot = await loadPot(supabase, user.id, league, 'h2h');

  return (
    <main className="pb-4">
      <AppBar
        title="Head to head"
        subtitle={`${league.name} · highest card wins the week`}
        back="/home"
        trailing={<LeagueSwitcher leagues={leagues} currentId={league.id} />}
      />

      <H2HPanel
        leagueId={league.id}
        season={league.season}
        week={league.current_week}
        challenges={challenges}
        mates={mates}
      />

      <div className="mt-5 space-y-2">
        <ModePot pot={pot} leagueId={league.id} season={league.season} />
        <ModeChatButton leagueId={league.id} mode="h2h" label="Head to head" />
      </div>
    </main>
  );
}
