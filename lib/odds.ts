// Scoring from odds.
//
// THE RULE: every pick is a $10 bet, and you score what it pays.
//
// Fixed points per market cannot work. If a team is -0.5 on the spread, that
// spread and that moneyline are the *same bet* — so any scheme paying the
// spread more is free arbitrage. Pricing from the odds removes the choice:
// equivalent bets pay equally because the book priced them equally.
//
// It also fixes the other end. A -600 favourite and a +400 underdog are both
// "a moneyline", but one is nearly free and the other rarely lands. Paying
// them the same rewards picking chalk.
//
// Because the book prices every market to roughly the same expected return,
// no market and no side is ever strictly better. Points come from beating the
// line, and long shots add variance without being exploitable.

/** Stake every pick is scored as, in points. */
export const STAKE = 10;

/** Nothing pays more than this, however long the odds. */
export const MAX_POINTS = 150;

/**
 * American odds to decimal (total return per unit staked, stake included).
 *
 * +400 -> 5.00   (win $40 on $10, plus the $10 back)
 * -600 -> 1.1667 (win $1.67 on $10, plus the $10 back)
 */
export function americanToDecimal(american: number): number | null {
  if (!Number.isFinite(american)) return null;
  // No book prices between -100 and +100; a value there means a misread field.
  if (Math.abs(american) < 100) return null;
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

/** The book's implied win probability, vig included. */
export function impliedProbability(american: number): number | null {
  const decimal = americanToDecimal(american);
  return decimal === null ? null : 1 / decimal;
}

/**
 * What a winning pick is worth.
 *
 * Whole points, because a leaderboard of 18.3 and 19.1 reads like homework.
 * Capped so a 2000-1 long shot cannot decide a season on its own.
 */
export function pointsForOdds(american: number | null | undefined): number {
  if (american === null || american === undefined) return DEFAULT_WIN_POINTS;
  const decimal = americanToDecimal(american);
  if (decimal === null) return DEFAULT_WIN_POINTS;
  return Math.min(MAX_POINTS, Math.round(STAKE * decimal));
}

/**
 * Fallback when a pick somehow has no stored price.
 *
 * -110 is the standard price on a spread or total, so this is what the
 * overwhelming majority of picks are worth anyway.
 */
export const DEFAULT_WIN_POINTS = Math.round(STAKE * (1 + 100 / 110)); // 19

/** A push returns the stake, exactly as a real bet would. */
export const PUSH_POINTS = STAKE;

/**
 * A readable description of what a pick pays, for the UI.
 *
 * "+19" reads as a payout; the odds are shown alongside so the number is
 * never mysterious.
 */
export function describePayout(american: number | null | undefined): string {
  return `+${pointsForOdds(american)}`;
}

/**
 * Probability to American odds.
 *
 * Used by TD Scorer, which has no sportsbook feed: a player's scoring rate is
 * turned into a price so it can be shown and scored like every other pick.
 */
export function probabilityToAmerican(probability: number): number | null {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return null;
  return probability >= 0.5
    ? -Math.round((100 * probability) / (1 - probability))
    : Math.round((100 * (1 - probability)) / probability);
}
