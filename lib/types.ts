// Shared domain types. These mirror the Postgres enums in
// supabase/migrations/0001_foundation.sql; keep them in step.

import { STAKE, probabilityToAmerican, pointsForOdds } from './odds';

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

/**
 * League-average scoring rate, used to shrink small samples toward the middle.
 *
 * Without it a backup who scored in his only appearance reads as a 100% scorer
 * and would be priced as the safest pick on the board.
 */
const TD_PRIOR_RATE = 0.18;
const TD_PRIOR_WEIGHT = 4;

/** A player's chance of scoring, shrunk toward the league average. */
export function tdScoringProbability(totalTds: number, gamesPlayed: number): number {
  const tds = Number.isFinite(totalTds) ? Math.max(0, totalTds) : 0;
  const games = Number.isFinite(gamesPlayed) ? Math.max(0, gamesPlayed) : 0;
  const rate = (tds + TD_PRIOR_RATE * TD_PRIOR_WEIGHT) / (games + TD_PRIOR_WEIGHT);
  // Keep inside the range American odds can express.
  return Math.min(0.9, Math.max(0.02, rate));
}

/** That probability expressed as a price, so TD picks read like every other. */
export function tdAmericanOdds(totalTds: number, gamesPlayed: number): number {
  return probabilityToAmerican(tdScoringProbability(totalTds, gamesPlayed)) ?? 400;
}

/** What a TD pick pays if the player scores. */
export function tdPointsFor(totalTds: number, gamesPlayed: number): number {
  return pointsForOdds(tdAmericanOdds(totalTds, gamesPlayed));
}

/**
 * A plain-language band for a player's price.
 *
 * Purely a display aid — the payout always comes from the odds. This just lets
 * the UI group names into "likely" and "long shot" without anyone doing sums.
 */
export type TdBand = 'lock' | 'solid' | 'longshot';

export function tdBandFor(totalTds: number, gamesPlayed: number): TdBand {
  const probability = tdScoringProbability(totalTds, gamesPlayed);
  if (probability >= 0.45) return 'lock';
  if (probability >= 0.22) return 'solid';
  return 'longshot';
}

export const TD_BAND_LABEL: Record<TdBand, string> = {
  lock: 'Likely',
  solid: 'Live',
  longshot: 'Long shot',
};

export { STAKE };
