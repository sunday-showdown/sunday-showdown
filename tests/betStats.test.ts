import { describe, it, expect } from 'vitest';
import { summarise, streakOf, byBook, byKind, formatUnits, formatRate } from '../lib/betStats';
import type { TrackedBet } from '../lib/betStats';

let clock = 0;
function bet(partial: Partial<TrackedBet> = {}): TrackedBet {
  clock += 1;
  return {
    id: `b${clock}`,
    book: 'draftkings',
    legs: 1,
    americanOdds: -110,
    stake: 10,
    result: 'pending',
    createdAt: new Date(2026, 0, clock).toISOString(),
    ...partial,
  };
}

describe('summarise', () => {
  it('is empty for no bets', () => {
    const record = summarise([], 10);
    expect(record).toMatchObject({ wins: 0, settled: 0, winRate: null, roi: null });
  });

  it('counts the record and leaves pending out of it', () => {
    const record = summarise(
      [
        bet({ result: 'win' }),
        bet({ result: 'win' }),
        bet({ result: 'loss' }),
        bet({ result: 'push' }),
        bet({ result: 'pending' }),
      ],
      10,
    );
    expect(record).toMatchObject({ wins: 2, losses: 1, pushes: 1, pending: 1, settled: 4 });
  });

  it('excludes pushes from the win rate, as a book would', () => {
    // 2-1 with a push is 66.7%, not 50%.
    const record = summarise(
      [bet({ result: 'win' }), bet({ result: 'win' }), bet({ result: 'loss' }), bet({ result: 'push' })],
      10,
    );
    expect(record.winRate).toBeCloseTo(2 / 3, 5);
  });

  it('is null rather than zero when nothing has been decided', () => {
    // 0% would read as "lost everything" to somebody who has bet nothing.
    expect(summarise([bet({ result: 'pending' })], 10).winRate).toBeNull();
    expect(summarise([bet({ result: 'push' })], 10).winRate).toBeNull();
  });

  it('pays a win at the odds and charges a loss the stake', () => {
    // One unit at -110 returns 0.909u; one unit lost costs 1u.
    const won = summarise([bet({ result: 'win', stake: 10, americanOdds: -110 })], 10);
    expect(won.unitsStaked).toBe(1);
    expect(won.unitsWon).toBeCloseTo(0.91, 2);

    const lost = summarise([bet({ result: 'loss', stake: 10 })], 10);
    expect(lost.unitsWon).toBe(-1);
  });

  it('returns the stake on a push, so it moves neither figure', () => {
    const record = summarise([bet({ result: 'push', stake: 50 })], 10);
    expect(record.unitsStaked).toBe(5);
    expect(record.unitsWon).toBe(0);
  });

  it('scales units by the stake, not by the number of bets', () => {
    // A $100 win at +100 on a $10 unit is +10u, not +1u.
    const record = summarise([bet({ result: 'win', stake: 100, americanOdds: 100 })], 10);
    expect(record.unitsStaked).toBe(10);
    expect(record.unitsWon).toBe(10);
  });

  it('computes ROI as profit over turnover', () => {
    const record = summarise(
      [
        bet({ result: 'win', stake: 10, americanOdds: 100 }), // +1u on 1u
        bet({ result: 'loss', stake: 10 }), // -1u on 1u
        bet({ result: 'win', stake: 10, americanOdds: 100 }), // +1u on 1u
      ],
      10,
    );
    expect(record.unitsStaked).toBe(3);
    expect(record.unitsWon).toBe(1);
    expect(record.roi).toBeCloseTo(1 / 3, 2);
  });

  it('counts a bet with no stake towards the record but not the money', () => {
    // Treating a missing stake as one unit would be inventing the number.
    const record = summarise([bet({ result: 'win', stake: null }), bet({ result: 'loss', stake: null })], 10);
    expect(record).toMatchObject({ wins: 1, losses: 1, unitsStaked: 0, unitsWon: 0, roi: null });
    expect(record.winRate).toBe(0.5);
  });

  it('reports no money figures when the unit size is nonsense', () => {
    const record = summarise([bet({ result: 'win', stake: 10 })], 0);
    expect(record).toMatchObject({ unitsStaked: 0, unitsWon: 0, roi: null, wins: 1 });
  });

  it('never reports negative zero', () => {
    expect(Object.is(summarise([bet({ result: 'push' })], 10).unitsWon, -0)).toBe(false);
  });
});

describe('streakOf', () => {
  it('counts the most recent run', () => {
    const bets = [
      bet({ result: 'loss' }),
      bet({ result: 'win' }),
      bet({ result: 'win' }),
      bet({ result: 'win' }),
    ];
    expect(streakOf(bets)).toEqual({ kind: 'win', length: 3 });
  });

  it('skips pushes rather than letting one break a run', () => {
    // A push is the bet not happening; no tracker treats it as a loss.
    const bets = [bet({ result: 'win' }), bet({ result: 'push' }), bet({ result: 'win' })];
    expect(streakOf(bets)).toEqual({ kind: 'win', length: 2 });
  });

  it('ignores pending bets, which have not happened yet', () => {
    const bets = [bet({ result: 'loss' }), bet({ result: 'loss' }), bet({ result: 'pending' })];
    expect(streakOf(bets)).toEqual({ kind: 'loss', length: 2 });
  });

  it('is nothing when nothing has settled', () => {
    expect(streakOf([bet({ result: 'pending' })])).toEqual({ kind: null, length: 0 });
    expect(streakOf([])).toEqual({ kind: null, length: 0 });
  });

  it('reads by date rather than by array order', () => {
    const older = bet({ result: 'win', createdAt: new Date(2026, 0, 1).toISOString() });
    const newer = bet({ result: 'loss', createdAt: new Date(2026, 5, 1).toISOString() });
    expect(streakOf([newer, older])).toEqual({ kind: 'loss', length: 1 });
    expect(streakOf([older, newer])).toEqual({ kind: 'loss', length: 1 });
  });
});

describe('byBook', () => {
  it('splits the record per book, busiest first', () => {
    const records = byBook(
      [
        bet({ book: 'fanduel', result: 'win' }),
        bet({ book: 'draftkings', result: 'loss' }),
        bet({ book: 'draftkings', result: 'win' }),
        bet({ book: 'draftkings', result: 'win' }),
      ],
      10,
    );
    expect(records.map((r) => r.book)).toEqual(['draftkings', 'fanduel']);
    expect(records[0]).toMatchObject({ wins: 2, losses: 1 });
    expect(records[1]).toMatchObject({ wins: 1, losses: 0 });
  });
});

describe('byKind', () => {
  it('separates singles from parlays', () => {
    const { singles, parlays } = byKind(
      [
        bet({ legs: 1, result: 'win' }),
        bet({ legs: 3, result: 'loss' }),
        bet({ legs: 2, result: 'loss' }),
      ],
      10,
    );
    expect(singles).toMatchObject({ wins: 1, losses: 0 });
    expect(parlays).toMatchObject({ wins: 0, losses: 2 });
  });

  it('treats a slip with no legs recorded as a single', () => {
    const { singles } = byKind([bet({ legs: 0, result: 'win' })], 10);
    expect(singles.wins).toBe(1);
  });
});

describe('formatting', () => {
  it('writes units the way a record is written', () => {
    expect(formatUnits(8.4)).toBe('+8.4u');
    expect(formatUnits(-2)).toBe('-2u');
    expect(formatUnits(0)).toBe('0u');
  });

  it('writes a rate, or nothing when there is nothing to write', () => {
    expect(formatRate(0.6667)).toBe('66.7%');
    expect(formatRate(null)).toBe('—');
  });
});
