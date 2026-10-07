import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import AppBar from '@/components/AppBar';
import BetTrackerClient from '@/components/BetTrackerClient';
import type { TrackedBet } from '@/lib/betStats';

export const metadata = { title: 'My bets' };
export const dynamic = 'force-dynamic';

export default async function BetsPage() {
  const user = (await getSessionUser())!;
  const supabase = await createServerSupabase();

  // Everything this person has logged, private and shared alike. RLS already
  // limits shared_bets to their own rows plus their leagues', so the filter on
  // user_id is what makes this their record rather than the league's.
  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase
      .from('shared_bets')
      .select('id, book, legs, american_odds, stake, result, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('profiles')
      .select('unit_size, preferred_books')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const bets: TrackedBet[] = (rows ?? []).map((row) => ({
    id: row.id as string,
    book: row.book as string,
    legs: Array.isArray(row.legs) ? row.legs.length : 1,
    americanOdds: Number(row.american_odds),
    stake: row.stake === null ? null : Number(row.stake),
    result: (row.result as string) ?? 'pending',
    createdAt: row.created_at as string,
  }));

  const unitSize = Number(profile?.unit_size ?? 10) || 10;

  return (
    <main>
      <AppBar title="My bets" subtitle="Units, ROI and your real record" back="/profile" />
      <BetTrackerClient
        bets={bets}
        unitSize={unitSize}
        preferredBooks={(profile?.preferred_books as string[]) ?? []}
      />
    </main>
  );
}
