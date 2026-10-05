// Which league you are looking at.
//
// Every screen used to do `leagues.find(l => l.id === params.league) ?? leagues[0]`,
// which meant the choice lived in a query string and was forgotten the moment
// you tapped anything that did not carry it forward. In a two-league account
// that reads as the app being stuck on one league, because it was.
//
// The selection now lives in a cookie, so it survives navigation, a cold start
// and the app being swiped away. A `?league=` in the URL still wins, so a
// shared link opens the league it names without changing what the rest of the
// app is set to.

import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMyLeagues, type LeagueSummary } from './week';
import { LEAGUE_COOKIE } from './league-cookie';

export { LEAGUE_COOKIE };

export interface LeagueContext {
  /** Every league this person belongs to, for the switcher. */
  leagues: LeagueSummary[];
  /** The one in view, or null when they belong to none. */
  league: LeagueSummary | null;
}

/**
 * The league in view, and the full list beside it.
 *
 * Resolution order is deliberate: an explicit link, then the remembered
 * choice, then the first league. The fallback matters — a cookie naming a
 * league somebody has since left must not leave them on a blank screen.
 */
export async function resolveLeague(
  db: SupabaseClient,
  userId: string,
  requested?: string,
): Promise<LeagueContext> {
  const leagues = await loadMyLeagues(db, userId);
  if (leagues.length === 0) return { leagues, league: null };

  const remembered = (await cookies()).get(LEAGUE_COOKIE)?.value;

  const league =
    leagues.find((l) => l.id === requested) ??
    leagues.find((l) => l.id === remembered) ??
    leagues[0]!;

  return { leagues, league };
}
