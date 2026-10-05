import { describe, it, expect } from 'vitest';
import { scorerFromPlayText, parseTouchdownScorers, normalizeName } from '../lib/espn/scoring-plays';

describe('scorerFromPlayText', () => {
  it('reads a rushing touchdown', () => {
    expect(scorerFromPlayText('Jonathan Taylor 5 Yd Rush (Spencer Shrader Kick)')).toBe('Jonathan Taylor');
  });

  it('credits the receiver, not the passer', () => {
    // The quarterback is named after "from" and did not score.
    expect(
      scorerFromPlayText('Treylon Burks 47 Yd pass from Athan Kaliakmanis (Drew Stevens Kick)'),
    ).toBe('Treylon Burks');
  });

  it('reads a defensive return', () => {
    expect(scorerFromPlayText('Micah Parsons 30 Yd Interception Return (Kick)')).toBe('Micah Parsons');
    expect(scorerFromPlayText('Jalen Ramsey 12 Yd Fumble Return (Kick Failed)')).toBe('Jalen Ramsey');
  });

  it('handles a one-yard plunge and a long score', () => {
    expect(scorerFromPlayText('Derrick Henry 1 Yd Rush (Kick)')).toBe('Derrick Henry');
    expect(scorerFromPlayText('Tyreek Hill 99 Yd pass from Tua Tagovailoa (Kick)')).toBe('Tyreek Hill');
  });

  it('tolerates the spacing ESPN actually emits', () => {
    expect(scorerFromPlayText('Saquon Barkley 7 Yds Rush (Kick)')).toBe('Saquon Barkley');
    expect(scorerFromPlayText('  Bijan Robinson  3 Yd Rush ')).toBe('Bijan Robinson');
  });

  it('rejects text with no yardage', () => {
    expect(scorerFromPlayText('Two-Point Conversion Good')).toBeNull();
    expect(scorerFromPlayText('')).toBeNull();
    expect(scorerFromPlayText(null)).toBeNull();
  });

  it('rejects a single-word credit, which is a team not a player', () => {
    expect(scorerFromPlayText('Cowboys 0 Yd Safety')).toBeNull();
  });
});

describe('parseTouchdownScorers', () => {
  const payload = {
    scoringPlays: [
      { scoringType: { name: 'field-goal' }, text: 'Drew Stevens 31 Yd Field Goal' },
      { scoringType: { name: 'touchdown' }, text: 'Jonathan Taylor 5 Yd Rush (Kick)' },
      { scoringType: { name: 'touchdown' }, text: 'Treylon Burks 47 Yd pass from Athan Kaliakmanis (Kick)' },
      { scoringType: { name: 'touchdown' }, text: 'Jonathan Taylor 2 Yd Rush (Kick)' },
    ],
  };

  it('returns only touchdown scorers', () => {
    const scorers = parseTouchdownScorers(payload);
    expect(scorers).toContain('jonathan taylor');
    expect(scorers).toContain('treylon burks');
    expect(scorers).not.toContain('drew stevens');
  });

  it('counts a player who scored twice once', () => {
    // The pick is "did he score", not "how many".
    expect(parseTouchdownScorers(payload).filter((s) => s === 'jonathan taylor')).toHaveLength(1);
  });

  it('returns nothing for a malformed payload rather than throwing', () => {
    expect(parseTouchdownScorers(null)).toEqual([]);
    expect(parseTouchdownScorers({})).toEqual([]);
    expect(parseTouchdownScorers({ scoringPlays: [] })).toEqual([]);
  });
});

describe('normalizeName', () => {
  it('matches across punctuation, accents and suffixes', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase');
    expect(normalizeName('Marvin Harrison Jr.')).toBe('marvin harrison');
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amonra st brown');
  });

  it('is stable for an already-clean name', () => {
    expect(normalizeName('Derrick Henry')).toBe('derrick henry');
  });
});
