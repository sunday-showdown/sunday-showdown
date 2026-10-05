import { describe, it, expect } from 'vitest';
import { describePick, formatRelative, isDifferentDay, formatCountdown } from '../lib/format';

const GAME = { home_abbr: 'KC', away_abbr: 'BUF' };

describe('describePick', () => {
  it('names the side for a moneyline, long and short', () => {
    expect(describePick('moneyline', 'home', GAME, null)).toBe('KC to win');
    expect(describePick('moneyline', 'away', GAME, null)).toBe('BUF to win');
    expect(describePick('moneyline', 'home', GAME, null, 'short')).toBe('KC ML');
  });

  it('carries the line on a spread, with its sign', () => {
    expect(describePick('spread', 'home', GAME, -3.5)).toBe('KC -3.5');
    expect(describePick('spread', 'away', GAME, 3.5)).toBe('BUF +3.5');
  });

  it('calls a zero spread a pick-em', () => {
    expect(describePick('spread', 'home', GAME, 0)).toBe('KC PK');
  });

  it('reads a total as over or under', () => {
    expect(describePick('total', 'over', GAME, 47.5)).toBe('Over 47.5');
    expect(describePick('total', 'under', GAME, 47.5)).toBe('Under 47.5');
  });

  it('does not leave a dangling number when a line is missing', () => {
    // A total with no line is a data problem, not a reason to render "Over ".
    expect(describePick('total', 'over', GAME, null)).toBe('Over');
    expect(describePick('total', 'over', GAME, undefined)).toBe('Over');
  });

  it('shows an em dash for a spread with no line rather than inventing one', () => {
    expect(describePick('spread', 'home', GAME, null)).toBe('KC —');
  });

  it('is identical long and short for spreads and totals', () => {
    // Only the moneyline differs; if that stops being true, the shared card and
    // the home list will start disagreeing again.
    for (const [market, selection, line] of [
      ['spread', 'home', -3.5],
      ['total', 'over', 47.5],
    ] as const) {
      expect(describePick(market, selection, GAME, line)).toBe(
        describePick(market, selection, GAME, line, 'short'),
      );
    }
  });
});

describe('formatRelative', () => {
  it('describes recent times in the units people use', () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(formatRelative(ago(5_000))).toBe('now');
    expect(formatRelative(ago(4 * 60_000))).toBe('4m');
    expect(formatRelative(ago(3 * 3_600_000))).toBe('3h');
    expect(formatRelative(ago(2 * 86_400_000))).toBe('2d');
  });

  it('is empty rather than wrong for missing or unparseable input', () => {
    expect(formatRelative(null)).toBe('');
    expect(formatRelative(undefined)).toBe('');
    expect(formatRelative('not a date')).toBe('');
  });

  it('does not report a future timestamp as negative', () => {
    expect(formatRelative(new Date(Date.now() + 60_000).toISOString())).toBe('now');
  });
});

describe('isDifferentDay', () => {
  it('separates calendar days, not 24-hour spans', () => {
    // 11pm and 1am are two hours apart and belong under different dividers.
    const late = new Date(2026, 0, 1, 23, 0).toISOString();
    const early = new Date(2026, 0, 2, 1, 0).toISOString();
    expect(isDifferentDay(late, early)).toBe(true);
  });

  it('keeps one day together', () => {
    const morning = new Date(2026, 0, 1, 9, 0).toISOString();
    const night = new Date(2026, 0, 1, 22, 0).toISOString();
    expect(isDifferentDay(morning, night)).toBe(false);
  });

  it('says no rather than throwing on bad input', () => {
    expect(isDifferentDay('nope', new Date().toISOString())).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('drops to the units that matter as the lock approaches', () => {
    expect(formatCountdown(2 * 86_400_000 + 4 * 3_600_000)).toBe('2d 4h');
    expect(formatCountdown(3 * 3_600_000 + 12 * 60_000)).toBe('3h 12m');
    expect(formatCountdown(8 * 60_000)).toBe('8m');
  });

  it('never shows 0m before the lock', () => {
    // Thirty seconds left is "1m", not "0m", which would read as already shut.
    expect(formatCountdown(30_000)).toBe('1m');
  });

  it('says locked once it has passed', () => {
    expect(formatCountdown(0)).toBe('Locked');
    expect(formatCountdown(-5000)).toBe('Locked');
  });
});
