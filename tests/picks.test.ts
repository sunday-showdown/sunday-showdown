import { describe, it, expect } from 'vitest';
import {
  resolveContestLine,
  validateSubmission,
  parseSubmittedPicks,
  isPickemMarket,
  isValidSelection,
} from '../lib/picks';

const odds = [
  { market_type: 'moneyline', selection: 'home', line: null, american_odds: -535 },
  { market_type: 'moneyline', selection: 'away', line: null, american_odds: 400 },
  { market_type: 'spread', selection: 'home', line: -9.5, american_odds: -110 },
  { market_type: 'spread', selection: 'away', line: 9.5, american_odds: -110 },
  { market_type: 'total', selection: 'over', line: 47.5, american_odds: -110 },
  { market_type: 'total', selection: 'under', line: 47.5, american_odds: -110 },
];

describe('market and selection guards', () => {
  it('accepts only the three Pick\'em markets', () => {
    expect(isPickemMarket('moneyline')).toBe(true);
    expect(isPickemMarket('spread')).toBe(true);
    expect(isPickemMarket('total')).toBe(true);
    // anytime_td is TD Scorer's market and must never arrive as a Pick'em pick.
    expect(isPickemMarket('anytime_td')).toBe(false);
    expect(isPickemMarket('prop')).toBe(false);
    expect(isPickemMarket(null)).toBe(false);
  });

  it('pairs each market with its own selections', () => {
    expect(isValidSelection('total', 'over')).toBe(true);
    expect(isValidSelection('total', 'home')).toBe(false);
    expect(isValidSelection('spread', 'over')).toBe(false);
    expect(isValidSelection('moneyline', 'tie')).toBe(false);
  });
});

describe('resolveContestLine', () => {
  it('takes the line from the posted odds, never from the caller', () => {
    expect(resolveContestLine('spread', 'home', odds)).toEqual({
      contestLine: -9.5,
      contestOdds: -110,
    });
    expect(resolveContestLine('spread', 'away', odds)).toEqual({
      contestLine: 9.5,
      contestOdds: -110,
    });
  });

  it('gives moneyline a price but no line', () => {
    expect(resolveContestLine('moneyline', 'home', odds)).toEqual({
      contestLine: null,
      contestOdds: -535,
    });
  });

  it('resolves both sides of a total to the same number', () => {
    expect(resolveContestLine('total', 'over', odds)?.contestLine).toBe(47.5);
    expect(resolveContestLine('total', 'under', odds)?.contestLine).toBe(47.5);
  });

  it('returns null when the market was never posted', () => {
    // Rejected upstream rather than stored as a pick with no line, which could
    // never be graded.
    expect(resolveContestLine('total', 'over', [])).toBeNull();
    expect(resolveContestLine('spread', 'home', [odds[0]!])).toBeNull();
  });

  it('returns null for a spread row missing its line', () => {
    const broken = [{ market_type: 'spread', selection: 'home', line: null, american_odds: -110 }];
    expect(resolveContestLine('spread', 'home', broken)).toBeNull();
  });

  it('returns null for a moneyline row missing its price', () => {
    const broken = [{ market_type: 'moneyline', selection: 'home', line: null, american_odds: null }];
    expect(resolveContestLine('moneyline', 'home', broken)).toBeNull();
  });

  it('does not confuse one market for another', () => {
    const spreadOnly = [{ market_type: 'spread', selection: 'home', line: -3, american_odds: -110 }];
    expect(resolveContestLine('moneyline', 'home', spreadOnly)).toBeNull();
  });
});

describe('validateSubmission', () => {
  const SUNDAY = '2026-10-11T17:00Z';
  const THURSDAY = '2026-10-09T00:15Z';
  const base = {
    enabledMarkets: ['moneyline', 'spread', 'total'],
    kickoffByGameId: new Map([
      ['g-sun', SUNDAY],
      ['g-sun2', '2026-10-11T20:05Z'],
      ['g-thu', THURSDAY],
    ]),
    lockTime: SUNDAY,
    now: new Date('2026-10-10T12:00Z'),
  };

  it('accepts a legal card', () => {
    const result = validateSubmission(
      [
        { gameId: 'g-sun', marketType: 'spread', selection: 'home' },
        { gameId: 'g-sun2', marketType: 'total', selection: 'over' },
      ],
      base,
    );
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(2);
  });

  it('rejects a second pick on the same game', () => {
    // One market per game, mutually exclusive.
    const result = validateSubmission(
      [
        { gameId: 'g-sun', marketType: 'spread', selection: 'home' },
        { gameId: 'g-sun', marketType: 'moneyline', selection: 'home' },
      ],
      base,
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toEqual([{ gameId: 'g-sun', reason: 'duplicate_game' }]);
  });

  it('rejects rather than silently drops a disabled market', () => {
    const result = validateSubmission(
      [{ gameId: 'g-sun', marketType: 'total', selection: 'over' }],
      { ...base, enabledMarkets: ['moneyline', 'spread'] },
    );
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([{ gameId: 'g-sun', reason: 'market_not_enabled' }]);
  });

  it('rejects a game that is not on this week\'s slate', () => {
    const result = validateSubmission(
      [{ gameId: 'g-other-week', marketType: 'spread', selection: 'home' }],
      base,
    );
    expect(result.rejected).toEqual([{ gameId: 'g-other-week', reason: 'unknown_game' }]);
  });

  it('rejects a mismatched selection', () => {
    const result = validateSubmission(
      [{ gameId: 'g-sun', marketType: 'total', selection: 'home' }],
      base,
    );
    expect(result.rejected).toEqual([{ gameId: 'g-sun', reason: 'invalid_selection' }]);
  });

  it('rejects a Thursday game after it has kicked off, with the card still open', () => {
    const friday = new Date('2026-10-09T14:00Z');
    const result = validateSubmission(
      [
        { gameId: 'g-thu', marketType: 'spread', selection: 'home' },
        { gameId: 'g-sun', marketType: 'spread', selection: 'home' },
      ],
      { ...base, now: friday },
    );
    expect(result.rejected).toEqual([{ gameId: 'g-thu', reason: 'game_started' }]);
    expect(result.accepted).toHaveLength(1);
  });

  it('rejects everything once the card locks', () => {
    const result = validateSubmission(
      [
        { gameId: 'g-sun', marketType: 'spread', selection: 'home' },
        { gameId: 'g-sun2', marketType: 'total', selection: 'over' },
      ],
      { ...base, now: new Date('2026-10-11T18:00Z') },
    );
    expect(result.accepted).toEqual([]);
    expect(result.rejected.every((r) => r.reason === 'card_locked')).toBe(true);
  });

  it('locks exactly at the Sunday kickoff instant', () => {
    const result = validateSubmission(
      [{ gameId: 'g-sun2', marketType: 'total', selection: 'over' }],
      { ...base, now: new Date(SUNDAY) },
    );
    expect(result.rejected).toEqual([{ gameId: 'g-sun2', reason: 'card_locked' }]);
  });

  it('accepts an empty card', () => {
    expect(validateSubmission([], base)).toEqual({ accepted: [], rejected: [] });
  });
});

describe('parseSubmittedPicks', () => {
  it('parses a well-formed payload', () => {
    expect(
      parseSubmittedPicks([{ gameId: 'g1', marketType: 'spread', selection: 'home' }]),
    ).toEqual([{ gameId: 'g1', marketType: 'spread', selection: 'home' }]);
  });

  it('ignores extra fields a client might send', () => {
    // Notably contest_line and contest_odds: the server resolves those itself,
    // so a client trying to supply them has no effect.
    const parsed = parseSubmittedPicks([
      { gameId: 'g1', marketType: 'spread', selection: 'home', contest_line: 40, points: 999 },
    ]);
    expect(parsed).toEqual([{ gameId: 'g1', marketType: 'spread', selection: 'home' }]);
  });

  it('rejects malformed payloads outright', () => {
    expect(parseSubmittedPicks(null)).toBeNull();
    expect(parseSubmittedPicks('nope')).toBeNull();
    expect(parseSubmittedPicks([null])).toBeNull();
    expect(parseSubmittedPicks([{ gameId: '', marketType: 'spread', selection: 'home' }])).toBeNull();
    expect(parseSubmittedPicks([{ gameId: 'g1', marketType: 'prop', selection: 'home' }])).toBeNull();
    expect(parseSubmittedPicks([{ gameId: 'g1', marketType: 'spread' }])).toBeNull();
  });

  it('accepts an empty array', () => {
    expect(parseSubmittedPicks([])).toEqual([]);
  });
});
