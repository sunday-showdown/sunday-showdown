import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { loadPot } from '@/lib/pot';
import TdBoard, { type TdCandidate } from '@/components/TdBoard';
import WeekSelector from '@/components/WeekSelector';
import EmptyState from '@/components/EmptyState';
import AppBar from '@/components/AppBar';
import LeagueSwitcher from '@/components/LeagueSwitcher';
import ModePot from '@/components/ModePot';
import ModeChatButton from '@/components/ModeChatButton';
import { isCardLocked } from '@/lib/contest';

export const metadata = { title: 'TD Scorer' };
export const dynamic = 'force-dynamic';

export default async function TdPage({
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
        <AppBar title="TD Scorer" back="/home" />
        <EmptyState
          title="No league yet"
          body="TD Scorer runs inside a league."
          action={<Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">Create a league</Link>}
        />
      </main>
    );
  }

  const requested = Number(params.week);
  const week =
    Number.isInteger(requested) && requested >= 1 && requested <= 18 ? requested : league.current_week;

  const { data: challenge } = await supabase
    .from('pickem_challenges')
    .select('id, lock_time')
    .eq('league_id', league.id)
    .eq('season', league.season)
    .eq('week', week)
    .maybeSingle();

  if (!challenge) {
    return (
      <main>
        <Header league={league.name} leagues={leagues} currentId={league.id} />
      <WeekSelector week={week} />
        <EmptyState title={`Week ${week} isn't open yet`} body="Contests open once the schedule is published." />
      </main>
    );
  }

  const [{ data: values }, { data: myPicks }] = await Promise.all([
    supabase
      .from('td_values')
      .select('player_id, td_point_value, american_odds, tier, nfl_players(name, position, headshot_url)')
      .eq('league_id', league.id)
      .eq('season', league.season)
      .eq('week', week),
    supabase
      .from('td_picks')
      .select('player_id, td_point_value, result')
      .eq('user_id', user.id)
      .eq('challenge_id', challenge.id),
  ]);

  const { data: candidateRows } = await supabase
    .from('td_players')
    .select('player_id, team_abbr, opponent_abbr, position')
    .eq('season', league.season)
    .eq('week', week)
    .eq('is_active', true);

  const slotFor = new Map(
    (candidateRows ?? []).map((c) => [
      c.player_id as string,
      { team: c.team_abbr as string, opponent: c.opponent_abbr as string, position: c.position as string },
    ]),
  );

  const candidates: TdCandidate[] = [];
  for (const value of values ?? []) {
    const slot = slotFor.get(value.player_id as string);
    if (!slot) continue;

    // supabase-js types a to-one embed as an array; accept both shapes.
    const embedded = (value as unknown as { nfl_players: unknown }).nfl_players;
    const player = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | { name: string; position: string | null; headshot_url: string | null }
      | null;
    if (!player) continue;

    candidates.push({
      playerId: value.player_id as string,
      name: player.name,
      teamAbbr: slot.team,
      opponentAbbr: slot.opponent,
      position: slot.position ?? player.position ?? '',
      headshotUrl: player.headshot_url,
      points: Math.round(Number(value.td_point_value)),
      americanOdds: (value.american_odds as number) ?? null,
      band: (value.tier as string) ?? 'solid',
    });
  }

  const pot = await loadPot(supabase, user.id, league, 'td');

  return (
    <main className="pb-4">
      <Header league={league.name} leagues={leagues} currentId={league.id} />
      <WeekSelector week={week} />

      {candidates.length === 0 ? (
        <EmptyState
          title="No players priced yet"
          body="Prices are generated when the week's slate syncs. Check back shortly."
        />
      ) : (
        <TdBoard
          challengeId={challenge.id as string}
          candidates={candidates}
          myPicks={(myPicks ?? []).map((p) => ({
            playerId: p.player_id as string,
            points: Math.round(Number(p.td_point_value)),
            result: p.result as string,
          }))}
          locked={isCardLocked(challenge.lock_time as string)}
        />
      )}

      <div className="mt-5 space-y-2">
        <ModePot pot={pot} leagueId={league.id} season={league.season} />
        <ModeChatButton leagueId={league.id} mode="td" label="TD Scorer" />
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
      title="TD Scorer"
      subtitle={`${league} · pick anyone to find the end zone`}
      back="/home"
      trailing={<LeagueSwitcher leagues={leagues} currentId={currentId} />}
    />
  );
}
