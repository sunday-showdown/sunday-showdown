import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadWeek } from '@/lib/week';
import { resolveLeague } from '@/lib/league';
import { loadPot } from '@/lib/pot';
import { loadChannels } from '@/lib/chat';
import PickSheet from '@/components/PickSheet';
import WeekSelector from '@/components/WeekSelector';
import EmptyState from '@/components/EmptyState';
import LeagueSwitcher from '@/components/LeagueSwitcher';
import AppBar from '@/components/AppBar';
import ModePot from '@/components/ModePot';
import ModeChatButton from '@/components/ModeChatButton';
import ShareCardButton from '@/components/ShareCardButton';
import { describePick } from '@/lib/format';
import { pointsForOdds } from '@/lib/odds';
import type { CardImagePick } from '@/lib/cardImage';

export const metadata = { title: 'Picks' };

export default async function PicksPage({
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
        <AppBar title="Picks" />
        <EmptyState
          title="No league yet"
          body="Create one and invite your friends, or join with an invite code."
          action={
            <Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">
              Create a league
            </Link>
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

  const [data, pot, channels] = await Promise.all([
    loadWeek(supabase, user.id, league, week),
    loadPot(supabase, user.id, league, 'pickem'),
    loadChannels(supabase, user.id),
  ]);

  // The same rows the shared card shows, prepared here so the picture and the
  // posted card cannot drift apart.
  const imagePicks: CardImagePick[] = data.myPicks.flatMap((pick) => {
    const game = data.games.find((g) => g.id === pick.game_id);
    if (!game) return [];
    const line = (data.oddsByGame[game.id] ?? []).find(
      (o) => o.market_type === pick.market_type && o.selection === pick.selection,
    );

    return [
      {
        label: describePick(pick.market_type, pick.selection, game, line?.line, 'short'),
        matchup: `${game.away_abbr} @ ${game.home_abbr}`,
        points: pointsForOdds(line?.american_odds ?? null),
        result: 'pending',
      },
    ];
  });

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <main>
      <AppBar
        title={`Week ${week}`}
        subtitle={league.name}
        trailing={<LeagueSwitcher leagues={leagues} currentId={league.id} />}
      />

      <WeekSelector week={week} />

      {!data.challenge ? (
        <EmptyState
          title={`Week ${week} isn't open yet`}
          body="Contests open automatically once the schedule for the week is published."
        />
      ) : (
        <PickSheet
          challengeId={data.challenge.id}
          lockTime={data.challenge.lock_time}
          lockPolicy={league.lock_policy}
          enabledMarkets={data.challenge.enabled_markets}
          games={data.games}
          oddsByGame={data.oddsByGame}
          existingPicks={data.myPicks}
        />
      )}

      {/* The pot and the room belong to this mode, beneath the game rather than
          in front of it. */}
      <div className="mt-5 space-y-2">
        {data.challenge && (
          <ShareCardButton
            challengeId={data.challenge.id}
            // This league's rooms only: a card belongs to the league whose
            // contest it is, and offering another league's channels would post
            // it where nobody can see the picks it references.
            channels={channels.filter((channel) => channel.leagueId === league.id)}
            pickCount={data.myPicks.length}
            image={{
              username: (profile?.username as string) ?? 'Showdown',
              week,
              season: league.season,
              picks: imagePicks,
              earned: 0,
              atStake: imagePicks.reduce((sum, pick) => sum + pick.points, 0),
            }}
          />
        )}
        <ModePot pot={pot} leagueId={league.id} season={league.season} />
        <ModeChatButton leagueId={league.id} mode="pickem" label="Pick'em" />
      </div>
    </main>
  );
}
