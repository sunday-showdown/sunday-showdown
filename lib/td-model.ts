// Pricing an anytime-touchdown pick.
//
// The old model was wrong in a way that showed: Derrick Henry priced at -900,
// implying he scores in nine games out of ten. No book has ever printed that
// for a touchdown prop; the best running back in football sits around -150 to
// +110. Three separate defects produced it.
//
// 1. It treated a scoring RATE as a PROBABILITY. Seven touchdowns in four games
//    is 1.75 per game — but "scores at least once" can never exceed 1. Feeding
//    a rate into a probability slot and clamping at 0.9 is how a good player
//    became a near-certainty. The fix is the Poisson relation: if somebody
//    averages λ scores a game, the chance of at least one is 1 - e^(-λ). It
//    rises steeply at first and then flattens, which is the actual shape of the
//    thing.
//
// 2. Games played was (week - 1) for everybody. A player who had missed a month
//    carried the same denominator as one who had started every week, so an
//    injured star kept an elite price while sitting on the bench.
//
// 3. Nothing about the opponent. Facing the league's worst run defence and its
//    best produced the same number, which is most of what a real line moves on.
//
// What it still cannot know: whether somebody is actually starting on Sunday,
// and snap-share within a committee. Those need a depth chart feed we do not
// have. The position prior and the shrinkage below are what stand in for them,
// and they are deliberately cautious — a deep reserve prices long, not free.

import { probabilityToAmerican } from './odds';

/**
 * Expected touchdowns per game for a typical starter at each position, used as
 * the prior a thin sample is pulled toward.
 *
 * A quarterback's figure is rushing only. Passing touchdowns are not scoring
 * plays by the passer and every sportsbook prices them separately.
 */
export const POSITION_PRIOR: Record<string, number> = {
  RB: 0.34,
  WR: 0.24,
  TE: 0.19,
  QB: 0.16,
  FB: 0.08,
};

const DEFAULT_PRIOR = 0.18;

/**
 * How many games of prior to mix in.
 *
 * Four is roughly where a player's own rate starts to say more than his
 * position does. Lower and one fluke week sets the price for a month; higher
 * and a genuinely elite scorer never separates from the field.
 */
export const PRIOR_WEIGHT = 4;

/** Nobody is priced shorter or longer than this, whatever the arithmetic says. */
export const MIN_PROBABILITY = 0.03;
export const MAX_PROBABILITY = 0.6;

export interface TdInputs {
  position: string | null;
  /** Rushing plus receiving touchdowns. Never passing. */
  touchdowns: number;
  gamesPlayed: number;
  /**
   * Opponent strength as a multiplier around 1: above 1 is a defence that
   * concedes more than average, below 1 one that concedes less.
   */
  opponentFactor?: number;
  /**
   * Carries plus receptions on the season. Null when unknown, which is treated
   * as neutral rather than as zero — absent data must not look like a player
   * who never touches the ball.
   */
  touches?: number | null;
}

export interface TdPrice {
  probability: number;
  americanOdds: number;
  /** Expected touchdowns per game, after shrinkage and the opponent. */
  lambda: number;
}

/**
 * Touchdowns per game, pulled toward what a player in this position normally
 * does.
 *
 * Shrinkage is what stops three games of noise becoming a season-long price.
 * With no games at all it returns the prior exactly, which is the honest answer
 * for a rookie nobody has seen yet.
 */
export function shrunkRate(
  touchdowns: number,
  gamesPlayed: number,
  position: string | null,
): number {
  const prior = POSITION_PRIOR[(position ?? '').toUpperCase()] ?? DEFAULT_PRIOR;
  const scores = Number.isFinite(touchdowns) ? Math.max(0, touchdowns) : 0;
  const games = Number.isFinite(gamesPlayed) ? Math.max(0, gamesPlayed) : 0;

  return (scores + prior * PRIOR_WEIGHT) / (games + PRIOR_WEIGHT);
}

/**
 * The chance of at least one touchdown, given a per-game rate.
 *
 * Poisson. This is the step the old model skipped, and the one that keeps a
 * price inside the range a book would print however many touchdowns somebody
 * has scored.
 */
export function atLeastOnce(lambda: number): number {
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;

  // Held just below 1. Mathematically the Poisson tail never reaches certainty,
  // but e^-37 underflows to zero in float64, so a large rate would return
  // exactly 1 — and a probability of 1 has no American-odds equivalent, so
  // anything converting it downstream would get null.
  return Math.min(1 - 1e-9, 1 - Math.exp(-lambda));
}

/**
 * How much a defence moves a price.
 *
 * Points allowed per game against the league average, because that is what the
 * schedule gives us for free; touchdowns allowed would be better and needs a
 * play-by-play feed. Clamped hard — the opponent is worth a nudge, not a
 * reclassification, and an early-season blowout should not make a defence look
 * historically bad.
 */
export function opponentFactor(
  pointsAllowedPerGame: number | null,
  leagueAveragePointsAllowed: number | null,
): number {
  if (
    pointsAllowedPerGame === null ||
    leagueAveragePointsAllowed === null ||
    !Number.isFinite(pointsAllowedPerGame) ||
    !Number.isFinite(leagueAveragePointsAllowed) ||
    leagueAveragePointsAllowed <= 0
  ) {
    return 1;
  }

  const ratio = pointsAllowedPerGame / leagueAveragePointsAllowed;
  return Math.min(1.3, Math.max(0.78, ratio));
}

/**
 * Touches per game a typical starter gets, used to tell a starter who has not
 * scored yet from somebody who is barely on the field.
 *
 * This is the signal that stops a scoreless WR1 and a fourth receiver being
 * priced alike. It is also the only thing standing in for a depth chart, which
 * is why it is allowed to cut a price harder than it can raise one.
 */
const STARTER_TOUCHES: Record<string, number> = {
  RB: 13,
  WR: 5,
  TE: 4,
  QB: 5,
  FB: 2,
};

export function usageFactor(
  touches: number | null | undefined,
  gamesPlayed: number,
  position: string | null,
): number {
  if (touches === null || touches === undefined || !Number.isFinite(touches)) return 1;
  if (!Number.isFinite(gamesPlayed) || gamesPlayed <= 0) return 1;

  const reference = STARTER_TOUCHES[(position ?? '').toUpperCase()] ?? 6;
  const perGame = Math.max(0, touches) / gamesPlayed;

  // Asymmetric on purpose: being heavily involved is already reflected in
  // having scored, so the upside is capped tight. Being absent from the offence
  // is not reflected anywhere else, so the downside runs further.
  return Math.min(1.15, Math.max(0.35, 0.35 + 0.65 * (perGame / reference)));
}

/**
 * How much to discount somebody with no games this season.
 *
 * Without it the prior alone prices an unseen rookie like a typical starter —
 * shorter than a proven backup, which is backwards. Nobody who has not played
 * should be among the likelier names on the board.
 */
const UNPROVEN_DISCOUNT = 0.45;

/** The full price for one player in one game. */
export function priceTd(inputs: TdInputs): TdPrice {
  const base = shrunkRate(inputs.touchdowns, inputs.gamesPlayed, inputs.position);
  const opponent = Number.isFinite(inputs.opponentFactor ?? 1) ? (inputs.opponentFactor ?? 1) : 1;
  const usage = usageFactor(inputs.touches, inputs.gamesPlayed, inputs.position);
  const unproven = (inputs.gamesPlayed ?? 0) > 0 ? 1 : UNPROVEN_DISCOUNT;

  const lambda = Math.max(0, base * opponent * usage * unproven);

  const probability = Math.min(MAX_PROBABILITY, Math.max(MIN_PROBABILITY, atLeastOnce(lambda)));

  return {
    probability,
    // probabilityToAmerican only returns null outside (0,1), which the clamp
    // above has already ruled out.
    americanOdds: probabilityToAmerican(probability) ?? 400,
    lambda,
  };
}

export type TdBand = 'lock' | 'solid' | 'longshot';

/**
 * A plain-language band, for grouping names in the UI.
 *
 * Display only — what a pick pays always comes from the odds. The thresholds
 * are where a bettor would stop calling something likely: around even money,
 * and around 4-1.
 */
export function bandFor(probability: number): TdBand {
  if (probability >= 0.42) return 'lock';
  if (probability >= 0.2) return 'solid';
  return 'longshot';
}
