// Shared domain types. These mirror the Postgres enums in
// supabase/migrations/0001_foundation.sql; keep them in step.

import { STAKE } from './odds';
import type { TdBand } from './td-model';

export type GameStatus = 'scheduled' | 'in_progress' | 'final' | 'postponed';

export type MarketType = 'moneyline' | 'spread' | 'total' | 'anytime_td';

/** The three markets a Pick'em selection may use. anytime_td is TD Scorer only. */
export type PickemMarket = Exclude<MarketType, 'anytime_td'>;

export type PickResult = 'pending' | 'win' | 'loss' | 'push';

export type ContestLineStatus = 'frozen' | 'graded';

export type SurvivorPickResult = 'pending' | 'survived' | 'eliminated' | 'push';

export type TdValueSource = 'auto' | 'manual';

export const PICKEM_MARKETS: readonly PickemMarket[] = ['moneyline', 'spread', 'total'];

export const MARKET_LABEL: Record<PickemMarket, string> = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  total: 'Total',
};

// TD Scorer -------------------------------------------------------------------
//
// There is no sportsbook feed for anytime-TD props on any free source, so a
// player's price is estimated from how often he actually scores and then run
// through the same payout rule as everything else. One rule for the whole app:
// every pick is a $10 bet and you score what it pays.

export type { TdBand };

export const TD_BAND_LABEL: Record<TdBand, string> = {
  lock: 'Likely',
  solid: 'Live',
  longshot: 'Long shot',
};

export { STAKE };
