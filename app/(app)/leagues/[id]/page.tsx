import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadSeasonStandings } from '@/lib/standings';
import LeagueManager, { type Member } from '@/components/LeagueManager';
import LeagueSettings, { LeagueBadge } from '@/components/LeagueSettings';
import AppBar from '@/components/AppBar';

export const metadata = { title: 'League' };
export const dynamic = 'force-dynamic';

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = (await getSessionUser())!;
  const { id } = await params;
  const supabase = await createServerSupabase();

  // RLS limits this to leagues the viewer belongs to, so a stranger's id reads
  // as not found rather than leaking that it exists.
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, avatar_url, invite_code, season, current_week, commissioner_id, lock_policy, default_markets, allow_late_join')
    .eq('id', id)
    .maybeSingle();

  if (!league) notFound();

  const [{ data: memberRows }, standings] = await Promise.all([
    supabase.from('league_members').select('user_id').eq('league_id', id),
    loadSeasonStandings(supabase, id, league.season as number),
  ]);

  const memberIds = (memberRows ?? []).map((m) => m.user_id as string);
  const { data: profiles } = memberIds.length
    ? await supabase.from('profiles').select('user_id, username').in('user_id', memberIds)
    : { data: [] };

  const standingFor = new Map(standings.map((s) => [s.userId, s]));

  const members: Member[] = (profiles ?? [])
    .map((p) => {
      const standing = standingFor.get(p.user_id as string);
      return {
        userId: p.user_id as string,
        username: p.username as string,
        isCommissioner: p.user_id === league.commissioner_id,
        points: standing?.totalPoints ?? 0,
        rank: standing?.rank ?? null,
      };
    })
    // Ranked players first, then everyone who has not been graded yet.
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.username.localeCompare(b.username));

  return (
    <main className="pb-6">
      <AppBar
        title={league.name as string}
        subtitle={`${league.season} · week ${league.current_week}`}
        back="/leagues"
      />

      <section className="flex items-center gap-3.5 px-4 pb-3">
        <LeagueBadge name={league.name as string} url={(league.avatar_url as string) ?? null} size={56} />
        <div className="min-w-0">
          <div className="display truncate text-[20px] leading-none">{league.name as string}</div>
          <div className="mt-1 text-[11.5px] text-muted">
            {members.length} member{members.length === 1 ? '' : 's'} ·{' '}
            {league.lock_policy === 'per_game' ? 'locks per game' : 'locks at first kickoff'}
          </div>
        </div>
      </section>

      <LeagueManager
        leagueId={league.id as string}
        name={league.name as string}
        inviteCode={league.invite_code as string}
        season={league.season as number}
        members={members}
        isCommissioner={league.commissioner_id === user.id}
        myId={user.id}
      />

      {league.commissioner_id === user.id && (
        <LeagueSettings
          leagueId={league.id as string}
          leagueName={league.name as string}
          rules={{
            lockPolicy: (league.lock_policy as 'first_kickoff' | 'per_game') ?? 'first_kickoff',
            markets: (league.default_markets as string[]) ?? ['moneyline', 'spread', 'total'],
            allowLateJoin: league.allow_late_join !== false,
            avatarUrl: (league.avatar_url as string) ?? null,
          }}
        />
      )}
    </main>
  );
}
