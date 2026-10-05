import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { isAlive } from '@/lib/survivor';
import { loadPot } from '@/lib/pot';
import SurvivorBoard, { type SurvivorGameOption } from '@/components/SurvivorBoard';
import EmptyState from '@/components/EmptyState';
import AppBar from '@/components/AppBar';
import LeagueSwitcher from '@/components/LeagueSwitcher';
import ModePot from '@/components/ModePot';
import ModeChatButton from '@/components/ModeChatButton';
import PoolInvite, { type InviteCandidate } from '@/components/PoolInvite';
import type { SurvivorPickResult } from '@/lib/types';

export const metadata = { title: 'Survivor' };

export default async function SurvivorPage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; week?: string; league?: string }>;
}) {
  const user = (await getSessionUser())!;
  const params = await searchParams;
  const supabase = await createServerSupabase();

  const { leagues, league } = await resolveLeague(supabase, user.id, params.league);
  if (!league) {
    return (
      <main>
        <AppBar title="Survivor" back="/home" />
        <EmptyState
          title="No league yet"
          body="Survivor pools live inside a league. Create or join one first."
          action={<Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">Create a league</Link>}
        />
      </main>
    );
  }


  const { data: pools } = await supabase
    .from('survivor_pools')
    .select('id, name, season, status, alive_count, member_count, winner_id, invite_code, buy_in, commissioner_id')
    .eq('season', league.season)
    .order('created_at', { ascending: true });

  const pool = (pools ?? []).find((p) => p.id === params.pool) ?? (pools ?? [])[0];

  if (!pool) {
    return (
      <main>
        <Header league={league.name} leagues={leagues} currentId={league.id} />
        <EmptyState
          title="No pool running"
          body="Start one and invite whoever you like — your league, your friends, or anybody with the code. Pick one team a week to win, and never the same team twice."
          action={
            <div className="flex flex-col gap-2">
              <CreatePoolLink season={league.season} leagueId={league.id} />
              <Link href="/survivor/join" className="btn-ghost h-11 px-5 text-sm">
                Join with a code
              </Link>
            </div>
          }
        />
      </main>
    );
  }

  const requested = Number(params.week);
  const week =
    Number.isInteger(requested) && requested >= 1 && requested <= 18
      ? requested
      : league.current_week;

  const [{ data: myPicks }, { data: games }] = await Promise.all([
    supabase
      .from('survivor_picks')
      .select('week, team_abbr, result')
      .eq('pool_id', pool.id)
      .eq('user_id', user.id)
      .order('week', { ascending: true }),
    supabase
      .from('nfl_games')
      .select('id, home_abbr, away_abbr, home_logo, away_logo, start_time, status')
      .eq('season', pool.season)
      .eq('week', week)
      .order('start_time', { ascending: true }),
  ]);

  const picks = myPicks ?? [];
  const alive = isAlive(picks.map((p) => p.result as SurvivorPickResult));
  const thisWeek = picks.find((p) => p.week === week);

  // One option per team, each carrying the game it belongs to.
  const options: SurvivorGameOption[] = [];
  for (const game of games ?? []) {
    const started = new Date(game.start_time as string).getTime() <= Date.now();
    options.push({
      gameId: game.id as string,
      teamAbbr: game.home_abbr as string,
      teamLogo: (game.home_logo as string) ?? null,
      opponentAbbr: game.away_abbr as string,
      isHome: true,
      kickoff: game.start_time as string,
      started,
    });
    options.push({
      gameId: game.id as string,
      teamAbbr: game.away_abbr as string,
      teamLogo: (game.away_logo as string) ?? null,
      opponentAbbr: game.home_abbr as string,
      isHome: false,
      kickoff: game.start_time as string,
      started,
    });
  }
  options.sort((a, b) => a.teamAbbr.localeCompare(b.teamAbbr));

  // The pot belongs to this pool, not to survivor in general, so two pools in
  // one league can run different buy-ins.
  const pot = await loadPot(supabase, user.id, league, 'survivor', pool.id as string);

  // Who this person could invite: their league, plus anyone they follow.
  const [{ data: leagueMates }, { data: following }] = await Promise.all([
    supabase.from('league_members').select('user_id').eq('league_id', league.id),
    supabase.from('follows').select('following_id').eq('follower_id', user.id),
  ]);

  const mateIds = (leagueMates ?? []).map((m) => m.user_id as string);
  const candidateIds = [
    ...new Set([...mateIds, ...(following ?? []).map((f) => f.following_id as string)]),
  ].filter((id) => id !== user.id);

  const { data: candidateProfiles } = candidateIds.length
    ? await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', candidateIds)
    : { data: [] };

  const inLeague = new Set(mateIds);
  const candidates: InviteCandidate[] = (candidateProfiles ?? [])
    .map((profile) => ({
      userId: profile.user_id as string,
      username: profile.username as string,
      avatarUrl: (profile.avatar_url as string) ?? null,
      reason: inLeague.has(profile.user_id as string) ? 'In your league' : 'You follow them',
    }))
    .sort((a, b) => a.username.localeCompare(b.username));

  return (
    <main className="pb-4">
      <Header league={league.name} leagues={leagues} currentId={league.id} />

      <section className="px-4">
        <div className="card flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{pool.name}</div>
            <div className="text-[11px] text-muted">
              {pool.alive_count} of {pool.member_count} still alive · week {week}
            </div>
          </div>
          <span
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
              alive ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'
            }`}
          >
            {alive ? 'ALIVE' : 'OUT'}
          </span>
        </div>
      </section>

      {picks.length > 0 && (
        <section className="mt-4 px-4">
          <h2 className="pb-2 eyebrow">
            Your run
          </h2>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {picks.map((p) => (
              <div
                key={p.week}
                className={`flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 ${
                  p.result === 'eliminated'
                    ? 'border-loss/40 bg-loss/10'
                    : p.result === 'pending'
                      ? 'border-line bg-raised'
                      : 'border-win/40 bg-win/10'
                }`}
              >
                <span className="text-[10px] text-muted">W{p.week}</span>
                <span className="display text-[15px] leading-none">{p.team_abbr}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <h2 className="px-4 pb-2 pt-5 eyebrow">
        Week {week} — pick one to win
      </h2>

      <SurvivorBoard
        poolId={pool.id as string}
        week={week}
        options={options}
        usedTeams={picks.map((p) => p.team_abbr as string)}
        currentPick={(thisWeek?.team_abbr as string) ?? null}
        alive={alive}
        locked={pool.status === 'completed'}
      />

      <div className="mt-5 space-y-2">
        <PoolInvite
          poolName={pool.name as string}
          inviteCode={pool.invite_code as string}
          buyIn={Math.round(Number(pool.buy_in ?? 0))}
          candidates={candidates}
        />
        <ModePot
          pot={pot}
          leagueId={league.id}
          season={league.season}
          competitionId={pool.id as string}
        />
        <ModeChatButton leagueId={league.id} mode="survivor" label="Survivor" />
      </div>
    </main>
  );
}

function Header({
  league,
  leagues,
  currentId,
}: {
  league: string;
  leagues: { id: string; name: string }[];
  currentId: string;
}) {
  return (
    <AppBar
      title="Survivor"
      subtitle={`${league} · one team a week, never twice`}
      back="/home"
      trailing={<LeagueSwitcher leagues={leagues} currentId={currentId} />}
    />
  );
}

function CreatePoolLink({ season, leagueId }: { season: number; leagueId: string }) {
  return (
    <Link
      href={`/survivor/new?season=${season}&league=${leagueId}`}
      className="btn-primary h-11 px-5 text-sm"
    >
      Start a pool
    </Link>
  );
}
