import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { isAlive } from '@/lib/survivor';
import { loadPoolBoard } from '@/lib/survivorPool';
import { loadPot } from '@/lib/pot';
import SurvivorBoard, { type SurvivorGameOption } from '@/components/SurvivorBoard';
import EmptyState from '@/components/EmptyState';
import AppBar from '@/components/AppBar';
import ModePot from '@/components/ModePot';
import ModeChatButton from '@/components/ModeChatButton';
import PoolRoster from '@/components/PoolRoster';
import PoolSwitcher from '@/components/PoolSwitcher';
import PoolInvite, { type InviteCandidate } from '@/components/PoolInvite';
import type { SurvivorPickResult } from '@/lib/types';

export const metadata = { title: 'Survivor' };
export const dynamic = 'force-dynamic';

export default async function SurvivorPage({
  searchParams,
}: {
  searchParams: Promise<{ pool?: string; week?: string; league?: string }>;
}) {
  const user = (await getSessionUser())!;
  const params = await searchParams;
  const supabase = await createServerSupabase();

  // A league is no longer required to be here. A pool can belong to one, to a
  // different one, or to nobody — so the active league decides the season and
  // the week, and the pools come from membership rather than from whichever
  // league happens to be selected. Having to switch leagues to look at a pool
  // was asking people to re-aim the whole app to read one screen.
  const { league } = await resolveLeague(supabase, user.id);
  const season = league?.season ?? new Date().getFullYear();

  const { data: pools } = await supabase
    .from('survivor_pools')
    .select('id, name, season, status, alive_count, member_count, winner_id, invite_code, buy_in, commissioner_id, league_id')
    .eq('season', season)
    .order('created_at', { ascending: true });

  const pool = (pools ?? []).find((p) => p.id === params.pool) ?? (pools ?? [])[0];

  if (!pool) {
    return (
      <main>
        <Header subtitle="One team a week, never twice" />
        <EmptyState
          title="No pool running"
          body="Start one and invite whoever you like — your league, your friends, or anybody with the code. Pick one team a week to win, and never the same team twice."
          action={
            <div className="flex flex-col gap-2">
              <CreatePoolLink season={season} leagueId={league?.id ?? null} />
              <Link href="/survivor/join" className="btn-ghost h-11 px-5 text-sm">
                Join with a code
              </Link>
            </div>
          }
        />
      </main>
    );
  }

  const poolLeagueId = (pool.league_id as string) ?? null;

  const requested = Number(params.week);
  const week =
    Number.isInteger(requested) && requested >= 1 && requested <= 18
      ? requested
      : (league?.current_week ?? 1);

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

  // The field. Who is alive, what the room has locked in, what each of them has
  // already spent — the part of survivor that was missing entirely.
  const board = await loadPoolBoard(supabase, user.id, pool.id as string, week);

  // The pot belongs to this pool, not to survivor in general, so two pools can
  // run different buy-ins — and it collects from the pool's own members, which
  // may include friends from outside any league. A pool with no league holds a
  // pot just the same.
  const pot = await loadPot(
    supabase,
    user.id,
    { leagueId: poolLeagueId, season },
    'survivor',
    pool.id as string,
  );

  // Who this person could invite: their leagues, plus anyone they follow.
  const [{ data: leagueMates }, { data: following }] = await Promise.all([
    supabase.from('league_members').select('user_id'),
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
  const inPool = new Set(board.entrants.map((e) => e.userId));
  const candidates: InviteCandidate[] = (candidateProfiles ?? [])
    .filter((profile) => !inPool.has(profile.user_id as string))
    .map((profile) => ({
      userId: profile.user_id as string,
      username: profile.username as string,
      avatarUrl: (profile.avatar_url as string) ?? null,
      reason: inLeague.has(profile.user_id as string) ? 'In your league' : 'You follow them',
    }))
    .sort((a, b) => a.username.localeCompare(b.username));

  const poolOptions = (pools ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    alive: Number(p.alive_count ?? 0),
    members: Number(p.member_count ?? 0),
  }));

  return (
    <main className="pb-4">
      <Header subtitle={`${pool.name} · week ${week}`} />

      <div className="px-4">
        <PoolSwitcher pools={poolOptions} currentId={pool.id as string} />
      </div>

      <section className="px-4">
        <div className={`card px-4 py-3.5 ${alive ? '' : 'opacity-80'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow">{pool.name}</div>
              <div className="display mt-1.5 text-[28px] leading-none">
                {board.aliveCount} still alive
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {board.outCount} out · {board.lockedIn} of {board.aliveCount} locked in for week{' '}
                {week}
              </div>
            </div>
            <span
              className={`chip shrink-0 ${alive ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}
            >
              {alive ? 'Alive' : 'Out'}
            </span>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="eyebrow">The field</h2>
          <span className="text-[11px] font-bold text-muted">
            {board.entrants.length} entrant{board.entrants.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="px-4">
          <PoolRoster entrants={board.entrants} week={week} />
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted">
            Picks stay hidden until their game kicks off. Struck-through teams went out.
          </p>
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
        <div className="px-4">
          <Link
            href="/survivor/join"
            className="card flex w-full items-center gap-3 px-4 py-3 active:bg-raised"
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raised text-[16px]"
            >
              🔑
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
                Somebody sent you a code?
              </div>
              <div className="mt-0.5 text-[13.5px] font-bold">Join another pool</div>
            </div>
            <span className="shrink-0 text-muted">›</span>
          </Link>
        </div>

        <PoolInvite
          poolName={pool.name as string}
          inviteCode={pool.invite_code as string}
          buyIn={Math.round(Number(pool.buy_in ?? 0))}
          candidates={candidates}
        />
        <ModePot
          pot={pot}
          leagueId={poolLeagueId}
          season={season}
          competitionId={pool.id as string}
        />
        {poolLeagueId && (
          <ModeChatButton leagueId={poolLeagueId} mode="survivor" label="Survivor" />
        )}
      </div>
    </main>
  );
}

function Header({ subtitle }: { subtitle: string }) {
  // No league switcher. A pool is its own thing; the pool switcher above the
  // board is the control that actually changes what you are looking at.
  return <AppBar title="Survivor" subtitle={subtitle} back="/home" />;
}

function CreatePoolLink({ season, leagueId }: { season: number; leagueId: string | null }) {
  return (
    <Link
      href={`/survivor/new?season=${season}${leagueId ? `&league=${leagueId}` : ''}`}
      className="btn-primary h-11 px-5 text-sm"
    >
      Start a pool
    </Link>
  );
}
