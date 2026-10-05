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

/**
 * Points per market.
 *
 * Moneyline pays least because it is the only market you can make safe — taking
 * a −600 favourite is close to a free point. Spread and total are both set by
 * the book to be coin flips, so they are equally hard and pay the same.
 *
 * The whole system is meant to be sayable in one breath: the winner is worth 1,
 * beating a line is worth 3.
 */
export const MARKET_POINTS: Record<PickemMarket, number> = {
  moneyline: 1,
  spread: 3,
  total: 3,
};

export const PICKEM_MARKETS: readonly PickemMarket[] = ['moneyline', 'spread', 'total'];

/**
 * TD Scorer tiers.
 *
 * A player is placed in a tier by how often he actually scores, and the tier is
 * the payout. Three buckets instead of a continuous curve, because a player
 * needs to be able to look at a name and know what it is worth without doing
 * arithmetic.
 *
 * Kept on the same scale as Pick'em so one TD pick cannot outweigh a whole card.
 */
export type TdTier = 'lock' | 'solid' | 'longshot';

export const TD_TIERS: Record<TdTier, { points: number; label: string; minRate: number }> = {
  // Scores in at least half his games.
  lock: { points: 2, label: 'Lock', minRate: 0.5 },
  // Scores in roughly a quarter to a half.
  solid: { points: 4, label: 'Solid', minRate: 0.25 },
  // Everyone else.
  longshot: { points: 8, label: 'Long shot', minRate: 0 },
};

/**
 * Which tier a player falls into, from touchdowns and games played.
 *
 * A player with fewer than three games has no meaningful rate yet, so he starts
 * as 'solid' rather than being called a long shot on one quiet appearance.
 */
export function tdTierFor(totalTds: number, gamesPlayed: number): TdTier {
  if (gamesPlayed < 3) return 'solid';
  const rate = totalTds / gamesPlayed;
  if (rate >= TD_TIERS.lock.minRate) return 'lock';
  if (rate >= TD_TIERS.solid.minRate) return 'solid';
  return 'longshot';
}

export function tdPointsFor(totalTds: number, gamesPlayed: number): number {
  return TD_TIERS[tdTierFor(totalTds, gamesPlayed)].points;
}
