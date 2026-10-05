import { describe, it, expect } from 'vitest';
import {
  decimalToAmerican,
  parlayOdds,
  payout,
  toWin,
  validateSlip,
  isFailure,
  summariseSlip,
  formatMoney,
} from '../lib/bets';
import { americanToDecimal } from '../lib/odds';

describe('decimalToAmerican', () => {
  it('round-trips through americanToDecimal', () => {
    // -100 is excluded deliberately: it is the same bet as +100, and the next
    // test pins which of the two a round trip should land on.
    for (const american of [-10000, -600, -250, -110, 100, 150, 400, 2500]) {
      const decimal = americanToDecimal(american)!;
      expect(decimalToAmerican(decimal)).toBe(american);
    }
  });

  it('puts the break-even point at +100, not -100', () => {
    // 2.0 decimal is an even-money bet, which every book prints as +100.
    expect(decimalToAmerican(2)).toBe(100);
  });

  it('rejects a decimal that is not a price', () => {
    expect(decimalToAmerican(1)).toBeNull();
    expect(decimalToAmerican(0.5)).toBeNull();
    expect(decimalToAmerican(Number.NaN)).toBeNull();
    expect(decimalToAmerican(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('parlayOdds', () => {
  it('multiplies decimal odds the way a book does', () => {
    // Two -110 legs: 1.9091^2 = 3.6446 decimal, which books print as +264.
    expect(parlayOdds([leg(-110), leg(-110)])).toBe(264);
  });

  it('matches the familiar three-leg -110 parlay price', () => {
    // The number every book quotes for a three-team teaser-free parlay.
    expect(parlayOdds([leg(-110), leg(-110), leg(-110)])).toBe(596);
  });

  it('passes a single leg through unchanged', () => {
    expect(parlayOdds([leg(-110)])).toBe(-110);
    expect(parlayOdds([leg(+275)])).toBe(275);
  });

  it('returns null when any leg is unpriced', () => {
    // A parlay missing a leg's price is not a shorter parlay, it is wrong.
    expect(parlayOdds([leg(-110), leg(null)])).toBeNull();
    expect(parlayOdds([leg(null)])).toBeNull();
  });

  it('returns null for odds no book would print', () => {
    expect(parlayOdds([leg(-110), leg(50)])).toBeNull();
  });

  it('returns null for an empty slip', () => {
    expect(parlayOdds([])).toBeNull();
  });

  it('combines a favourite and a long shot without drifting', () => {
    // -500 (1.2) and +600 (7.0) multiply to 8.4 decimal, which is +740.
    expect(parlayOdds([leg(-500), leg(600)])).toBe(740);
  });
});

describe('payout and toWin', () => {
  it('includes the stake in the payout and excludes it from the profit', () => {
    expect(payout(10, 400)).toBe(50);
    expect(toWin(10, 400)).toBe(40);
  });

  it('handles a favourite', () => {
    expect(payout(100, -200)).toBe(150);
    expect(toWin(100, -200)).toBe(50);
  });

  it('rounds to cents rather than carrying floating point noise', () => {
    expect(payout(33.33, -110)).toBe(63.63);
    expect(toWin(33.33, -110)).toBe(30.3);
  });

  it('is null without a stake, rather than zero', () => {
    // Zero would render as "$0 to win" on a slip whose stake nobody entered.
    expect(payout(null, 400)).toBeNull();
    expect(toWin(null, 400)).toBeNull();
    expect(payout(0, 400)).toBeNull();
  });
});

describe('validateSlip', () => {
  const base = { book: 'draftkings', legs: [{ description: 'Chiefs -3.5', americanOdds: -110 }] };

  it('accepts a single-leg slip and takes the leg price as the slip price', () => {
    const result = validateSlip(base);
    expect(isFailure(result)).toBe(false);
    if (isFailure(result)) return;
    expect(result.americanOdds).toBe(-110);
    expect(result.legs).toHaveLength(1);
    expect(result.stake).toBeNull();
  });

  it('computes a parlay price from the legs', () => {
    const result = validateSlip({
      ...base,
      legs: [
        { description: 'Chiefs -3.5', americanOdds: -110 },
        { description: 'Over 47.5', americanOdds: -110 },
      ],
    });
    if (isFailure(result)) throw new Error(result.error);
    expect(result.americanOdds).toBe(264);
  });

  it('lets a supplied total override the computed one', () => {
    // Books boost and round; the slip should say what the slip says.
    const result = validateSlip({ ...base, americanOdds: 300 });
    if (isFailure(result)) throw new Error(result.error);
    expect(result.americanOdds).toBe(300);
  });

  it('accepts a priceless parlay when the total is supplied', () => {
    const result = validateSlip({
      ...base,
      legs: [{ description: 'Same game parlay' }, { description: 'Another leg' }],
      americanOdds: 650,
    });
    if (isFailure(result)) throw new Error(result.error);
    expect(result.americanOdds).toBe(650);
    expect(result.legs[0]!.americanOdds).toBeNull();
  });

  it('refuses a slip with no price anywhere', () => {
    const result = validateSlip({ ...base, legs: [{ description: 'Chiefs -3.5' }] });
    expect(isFailure(result)).toBe(true);
  });

  it('refuses odds between -100 and +100', () => {
    expect(isFailure(validateSlip({ ...base, americanOdds: 50 }))).toBe(true);
    expect(isFailure(validateSlip({ ...base, legs: [{ description: 'x', americanOdds: -99 }] }))).toBe(true);
  });

  it('refuses an empty book, an empty leg list and an empty description', () => {
    expect(isFailure(validateSlip({ ...base, book: '  ' }))).toBe(true);
    expect(isFailure(validateSlip({ ...base, legs: [] }))).toBe(true);
    expect(isFailure(validateSlip({ ...base, legs: [{ description: '   ', americanOdds: -110 }] }))).toBe(true);
  });

  it('caps the number of legs', () => {
    const legs = Array.from({ length: 13 }, (_, i) => ({
      description: `Leg ${i}`,
      americanOdds: -110,
    }));
    expect(isFailure(validateSlip({ ...base, legs }))).toBe(true);
  });

  it('refuses a negative or absurd stake', () => {
    expect(isFailure(validateSlip({ ...base, stake: -5 }))).toBe(true);
    expect(isFailure(validateSlip({ ...base, stake: 10_000_000 }))).toBe(true);
  });

  it('rounds a stake to cents', () => {
    const result = validateSlip({ ...base, stake: 12.345 });
    if (isFailure(result)) throw new Error(result.error);
    expect(result.stake).toBe(12.35);
  });

  it('trims descriptions and drops an empty note', () => {
    const result = validateSlip({
      ...base,
      legs: [{ description: '  Chiefs -3.5  ', americanOdds: -110 }],
      note: '   ',
    });
    if (isFailure(result)) throw new Error(result.error);
    expect(result.legs[0]!.description).toBe('Chiefs -3.5');
    expect(result.note).toBeNull();
  });

  it('refuses a note past the limit', () => {
    expect(isFailure(validateSlip({ ...base, note: 'x'.repeat(281) }))).toBe(true);
  });

  it('refuses anything that is not an object', () => {
    for (const input of [null, undefined, 'slip', 42, []]) {
      expect(isFailure(validateSlip(input))).toBe(true);
    }
  });

  it('refuses a non-integer price', () => {
    // -110.5 is not a thing, and rounding it silently would misreport a slip.
    expect(isFailure(validateSlip({ ...base, americanOdds: -110.5 }))).toBe(true);
  });
});

describe('summariseSlip', () => {
  it('names a single leg and counts a parlay', () => {
    expect(summariseSlip([leg(-110, 'Chiefs -3.5')], -110)).toBe('Chiefs -3.5 (-110)');
    expect(summariseSlip([leg(-110), leg(-110)], 264)).toBe('2-leg parlay (+264)');
  });

  it('falls back to the price alone with no legs', () => {
    expect(summariseSlip([], 150)).toBe('+150');
  });
});

describe('formatMoney', () => {
  it('drops decimals when the amount is round', () => {
    expect(formatMoney(40)).toBe('$40');
    expect(formatMoney(1200)).toBe('$1,200');
  });

  it('keeps cents when there are any', () => {
    expect(formatMoney(30.3)).toBe('$30.30');
  });
});

function leg(americanOdds: number | null, description = 'A leg') {
  return { description, americanOdds };
}
