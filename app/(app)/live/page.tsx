import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues, loadWeek } from '@/lib/week';
import { liveState, liveValue, summarizeLive, type LivePick } from '@/lib/live';
import { formatSpread } from '@/lib/format';
import LiveCard, { type LiveRow } from '@/components/LiveCard';
import EmptyState from '@/components/EmptyState';
import type { PickemMarket } from '@/lib/types';

export const metadata = { title: 'Live' };
export const dynamic = 'force-dynamic';

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; league?: string }>;
}) {
  const user = (await getSessionUser())!;
  const params = await searchParams;
  const supabase = await createServerSupabase();

  const leagues = await loadMyLeagues(supabase, user.id);
  if (leagues.length === 0) {
    return (
      <EmptyState
        title="No league yet"
        body="Live tracking shows your card as the games play out."
        action={<Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">Create a league</Link>}
      />
    );
  }

  const league = leagues.find((l) => l.id === params.league) ?? leagues[0]!;
  const requested = Number(params.week);
  const week =
    Number.isInteger(requested) && requested >= 1 && requested <= 18 ? requested : league.current_week;

  const data = await loadWeek(supabase, user.id, league, week);

  // Results and prices come from the pick itself, not live odds: what a pick
  // pays was fixed when it was made.
  const { data: pickRows } = data.challenge
    ? await supabase
        .from('picks')
        .select('game_id, market_type, selection, contest_line, contest_odds, result, points')
        .eq('user_id', user.id)
        .eq('challenge_id', data.challenge.id)
    : { data: [] };

  const pickFor = new Map(
    (pickRows ?? []).map((p) => [
      p.game_id as string,
      {
        marketType: p.market_type as PickemMarket,
        selection: p.selection as string,
        contestLine: p.contest_line === null ? null : Number(p.contest_line),
        contestOdds: p.contest_odds === null ? null : Number(p.contest_odds),
        result: p.result as string,
        points: Number(p.points),
      } satisfies LivePick,
    ]),
  );

  const rows: LiveRow[] = data.games.map((game) => {
    const pick = pickFor.get(game.id) ?? null;
    const liveGame = {
      status: game.status,
      homeScore: game.home_score,
      awayScore: game.away_score,
    };

    return {
      gameId: game.id,
      awayAbbr: game.away_abbr,
      homeAbbr: game.home_abbr,
      awayLogo: game.away_logo,
      homeLogo: game.home_logo,
      awayScore: game.away_score,
      homeScore: game.home_score,
      status: game.status,
      statusDetail: null,
      kickoff: game.start_time,
      pickLabel: pick ? describe(pick, game) : null,
      state: pick ? liveState(pick, liveGame) : 'waiting',
      value: pick ? liveValue(pick, liveGame) : 0,
    };
  });

  // Games you picked first: that is what the page is for.
  rows.sort((a, b) => {
    if (Boolean(a.pickLabel) !== Boolean(b.pickLabel)) return a.pickLabel ? -1 : 1;
    const order = { in_progress: 0, scheduled: 1, final: 2, postponed: 3 } as Record<string, number>;
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  const totals = summarizeLive(
    [...pickFor.entries()].flatMap(([gameId, pick]) => {
      const game = data.games.find((g) => g.id === gameId);
      if (!game) return [];
      return [{ pick, game: { status: game.status, homeScore: game.home_score, awayScore: game.away_score } }];
    }),
  );

  return (
    <main className="pb-4">
      <header className="px-4 pb-3 pt-3 safe-top">
        <h1 className="display text-[28px] leading-none">Live</h1>
        <p className="text-xs text-muted">
          {league.name} · week {week}
        </p>
      </header>

      <LiveCard
        rows={rows}
        totals={{
          banked: Math.round(totals.banked),
          inPlay: Math.round(totals.inPlay),
          atRisk: Math.round(totals.atRisk),
          live: totals.live,
          waiting: totals.waiting,
        }}
        anyLive={data.games.some((g) => g.status === 'in_progress')}
      />
    </main>
  );
}

function describe(
  pick: LivePick,
  game: { home_abbr: string; away_abbr: string },
): string {
  if (pick.marketType === 'total') {
    const side = pick.selection === 'over' ? 'Over' : 'Under';
    return pick.contestLine === null ? side : `${side} ${pick.contestLine}`;
  }
  const abbr = pick.selection === 'home' ? game.home_abbr : game.away_abbr;
  if (pick.marketType === 'moneyline') return `${abbr} to win`;
  return `${abbr} ${formatSpread(pick.contestLine)}`;
}
