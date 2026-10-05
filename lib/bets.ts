// Shared bet slips.
//
// A slip is what somebody actually placed at a book: one or more legs, a price
// and, optionally, a stake. It is never scored against the league — the pick'em
// scoring in lib/odds.ts is the competition, and mixing real money into it
// would mean whoever bets most wins. A slip is a social object: you tail it,
// you fade it, you get to say you called it.
//
// The one piece of real maths is the parlay price. Books multiply decimal odds,
// so that is what this does; entering a parlay leg by leg and having the app
// agree with the book's printed price is the difference between a feature
// people use and one they stop trusting.

import { americanToDecimal } from './odds';

export const MAX_LEGS = 12;
export const MAX_NOTE = 280;

export interface BetLeg {
  /** Free text: "Chiefs -3.5", "Mahomes 2+ TD", "Over 47.5". */
  description: string;
  americanOdds: number | null;
}

export interface BetSlip {
  book: string;
  legs: BetLeg[];
  /** The price of the whole slip, as the book printed it. */
  americanOdds: number;
  stake: number | null;
  note: string | null;
}

/** Decimal odds back to American, rounded the way a book prints them. */
export function decimalToAmerican(decimal: number): number | null {
  if (!Number.isFinite(decimal) || decimal <= 1) return null;
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : -Math.round(100 / (decimal - 1));
}

/**
 * The combined price of a multi-leg slip.
 *
 * Returns null if any leg is unpriced, because a parlay price with a leg
 * missing is not a smaller parlay — it is wrong, and showing it would be worse
 * than showing nothing.
 */
export function parlayOdds(legs: readonly BetLeg[]): number | null {
  if (legs.length === 0) return null;

  let decimal = 1;
  for (const leg of legs) {
    if (leg.americanOdds === null) return null;
    const legDecimal = americanToDecimal(leg.americanOdds);
    if (legDecimal === null) return null;
    decimal *= legDecimal;
  }

  if (legs.length === 1) return legs[0]!.americanOdds;
  return decimalToAmerican(decimal);
}

/** What a stake returns if the slip wins, stake included. Two decimal places. */
export function payout(stake: number | null, americanOdds: number): number | null {
  if (stake === null || !Number.isFinite(stake) || stake <= 0) return null;
  const decimal = americanToDecimal(americanOdds);
  if (decimal === null) return null;
  return Math.round(stake * decimal * 100) / 100;
}

/** Profit alone, which is the number people actually quote. */
export function toWin(stake: number | null, americanOdds: number): number | null {
  const total = payout(stake, americanOdds);
  if (total === null || stake === null) return null;
  return Math.round((total - stake) * 100) / 100;
}

/** Currency without decimals when it is a round number. */
export function formatMoney(amount: number): string {
  return Number.isInteger(amount)
    ? `$${amount.toLocaleString('en-US')}`
    : `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface ValidationFailure {
  error: string;
}

/**
 * Validate a slip submitted from the browser.
 *
 * The database has the constraints that matter, but a 400 with a sentence
 * somebody can act on beats a Postgres error string in the UI.
 */
export function validateSlip(input: unknown): BetSlip | ValidationFailure {
  if (typeof input !== 'object' || input === null) return { error: 'No slip was sent.' };
  const raw = input as Record<string, unknown>;

  const book = typeof raw.book === 'string' ? raw.book.trim() : '';
  if (!book || book.length > 40) return { error: 'Pick which book this was placed at.' };

  if (!Array.isArray(raw.legs) || raw.legs.length === 0) {
    return { error: 'Add at least one leg.' };
  }
  if (raw.legs.length > MAX_LEGS) {
    return { error: `A slip can hold ${MAX_LEGS} legs.` };
  }

  const legs: BetLeg[] = [];
  for (const entry of raw.legs) {
    if (typeof entry !== 'object' || entry === null) return { error: 'One of the legs is empty.' };
    const leg = entry as Record<string, unknown>;

    const description = typeof leg.description === 'string' ? leg.description.trim() : '';
    if (!description) return { error: 'Every leg needs a description.' };
    if (description.length > 120) return { error: 'Keep each leg under 120 characters.' };

    const odds = leg.americanOdds;
    let americanOdds: number | null = null;
    if (odds !== null && odds !== undefined && odds !== '') {
      const parsed = Number(odds);
      if (!Number.isInteger(parsed) || Math.abs(parsed) < 100 || Math.abs(parsed) > 100000) {
        return { error: `"${description}" has odds no book would print.` };
      }
      americanOdds = parsed;
    }

    legs.push({ description, americanOdds });
  }

  // A single leg's price is the slip's price; a parlay's is the product.
  const combined = parlayOdds(legs);
  const supplied = raw.americanOdds;
  let americanOdds: number | null = combined;

  if (supplied !== null && supplied !== undefined && supplied !== '') {
    const parsed = Number(supplied);
    if (!Number.isInteger(parsed) || Math.abs(parsed) < 100 || Math.abs(parsed) > 100000) {
      return { error: 'That price is not one a book would print.' };
    }
    americanOdds = parsed;
  }

  if (americanOdds === null) {
    return { error: 'Add the odds — either on every leg, or the total price.' };
  }

  let stake: number | null = null;
  if (raw.stake !== null && raw.stake !== undefined && raw.stake !== '') {
    const parsed = Number(raw.stake);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) {
      return { error: 'That stake does not look right.' };
    }
    stake = Math.round(parsed * 100) / 100;
  }

  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null;
  if (note && note.length > MAX_NOTE) return { error: `Keep the note under ${MAX_NOTE} characters.` };

  return { book, legs, americanOdds, stake, note };
}

export function isFailure(result: BetSlip | ValidationFailure): result is ValidationFailure {
  return 'error' in result;
}

/** One line describing the slip, for a notification or a feed summary. */
export function summariseSlip(legs: readonly BetLeg[], americanOdds: number): string {
  const price = americanOdds > 0 ? `+${americanOdds}` : String(americanOdds);
  if (legs.length === 0) return price;
  if (legs.length === 1) return `${legs[0]!.description} (${price})`;
  return `${legs.length}-leg parlay (${price})`;
}
