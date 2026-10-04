// Shared domain types. These mirror the Postgres enums in
// supabase/migrations/0001_foundation.sql; keep them in step.

export type GameStatus = 'scheduled' | 'in_progress' | 'final' | 'postponed';

export type MarketType = 'moneyline' | 'spread' | 'total' | 'anytime_td';

/** The three markets a Pick'em selection may use. anytime_td is TD Scorer only. */
export type PickemMarket = Exclude<MarketType, 'anytime_td'>;

export type PickResult = 'pending' | 'win' | 'loss' | 'push';

export type ContestLineStatus = 'frozen' | 'graded';

export type SurvivorPickResult = 'pending' | 'survived' | 'eliminated' | 'push';

export type TdValueSource = 'auto' | 'manual';

/** Points awarded per market. Moneyline is the safe pick, so it pays least. */
export const MARKET_POINTS: Record<PickemMarket, number> = {
  moneyline: 1,
  spread: 5,
  total: 5,
};

export const PICKEM_MARKETS: readonly PickemMarket[] = ['moneyline', 'spread', 'total'];
