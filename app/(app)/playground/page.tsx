import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues } from '@/lib/week';
import PlaygroundCard from '@/components/PlaygroundCard';
import EmptyState from '@/components/EmptyState';

export const metadata = { title: 'Playground' };
export const dynamic = 'force-dynamic';

export default async function PlaygroundPage({
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
        body="Playground calls are shown to your league."
        action={<Link href="/leagues/new" className="btn-primary h-11 px-5 text-sm">Create a league</Link>}
      />
    );
  }

  const league = leagues.find((l) => l.id === params.league) ?? leagues[0]!;
  const week = league.current_week;

  const { data: card } = await supabase
    .from('playground_cards')
    .select('id, is_published')
    .eq('user_id', user.id)
    .eq('league_id', league.id)
    .eq('season', league.season)
    .eq('week', week)
    .maybeSingle();

  const { data: myCalls } = card
    ? await supabase
        .from('playground_picks')
        .select('id, target_name, prediction, confidence, is_pick_of_the_week, result')
        .eq('card_id', card.id)
        .order('created_at', { ascending: true })
    : { data: [] };

  // Everyone else's published calls, for the league to react to.
  const { data: publishedCards } = await supabase
    .from('playground_cards')
    .select('id, user_id')
    .eq('league_id', league.id)
    .eq('season', league.season)
    .eq('week', week)
    .eq('is_published', true);

  const otherCardIds = (publishedCards ?? [])
    .filter((c) => c.user_id !== user.id)
    .map((c) => c.id as string);

  const { data: otherCalls } = otherCardIds.length
    ? await supabase
        .from('playground_picks')
        .select('id, card_id, target_name, prediction, confidence, is_pick_of_the_week, result')
        .in('card_id', otherCardIds)
        .order('created_at', { ascending: false })
        .limit(40)
    : { data: [] };

  const authorIds = [...new Set((publishedCards ?? []).map((c) => c.user_id as string))];
  const { data: profiles } = authorIds.length
    ? await supabase.from('profiles').select('user_id, username').in('user_id', authorIds)
    : { data: [] };

  const nameOf = new Map((profiles ?? []).map((p) => [p.user_id as string, p.username as string]));
  const authorOfCard = new Map((publishedCards ?? []).map((c) => [c.id as string, c.user_id as string]));

  return (
    <main className="pb-4">
      <header className="px-4 pb-3 pt-3">
        <h1 className="display text-[28px] leading-none">Playground</h1>
        <p className="text-xs text-muted">
          {league.name} · week {week} · calls for bragging rights, not points
        </p>
      </header>

      <PlaygroundCard
        leagueId={league.id}
        season={league.season}
        week={week}
        cardId={(card?.id as string) ?? null}
        published={Boolean(card?.is_published)}
        myCalls={(myCalls ?? []).map((c) => ({
          id: c.id as string,
          targetName: c.target_name as string,
          prediction: (c.prediction as string) ?? '',
          confidence: (c.confidence as number) ?? null,
          isPickOfTheWeek: Boolean(c.is_pick_of_the_week),
          result: c.result as string,
        }))}
        leagueCalls={(otherCalls ?? []).map((c) => ({
          id: c.id as string,
          author: nameOf.get(authorOfCard.get(c.card_id as string) ?? '') ?? 'Someone',
          targetName: c.target_name as string,
          prediction: (c.prediction as string) ?? '',
          confidence: (c.confidence as number) ?? null,
          isPickOfTheWeek: Boolean(c.is_pick_of_the_week),
          result: c.result as string,
        }))}
      />
    </main>
  );
}
