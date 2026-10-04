import { describe, it, expect } from 'vitest';
import {
  parseAmericanOdds,
  parseLineValue,
  parseGameStatus,
  parseOddsEntry,
  parseEvent,
} from '../lib/espn/parse';

// Captured verbatim from site.api.espn.com on 2026-10-04 (Week 5,
// Buccaneers at Cowboys) so these tests exercise the real payload shape
// rather than an assumed one.
const realOddsEntry = {
  provider: { name: 'DraftKings', id: '100' },
  details: 'DAL -9.5',
  overUnder: 47.5,
  spread: -9.5,
  homeTeamOdds: { favorite: true, underdog: false, team: { abbreviation: 'DAL' } },
  awayTeamOdds: { favorite: false, underdog: true, team: { abbreviation: 'TB' } },
  moneyline: {
    home: { close: { odds: '-535' }, open: { odds: '-205' } },
    away: { close: { odds: '+400' }, open: { odds: '+170' } },
  },
  pointSpread: {
    home: { close: { line: '-9.5', odds: '-110' }, open: { line: '-3.5', odds: '-110' } },
    away: { close: { line: '+9.5', odds: '-110' }, open: { line: '+3.5', odds: '-110' } },
  },
  total: {
    over: { close: { line: 'o47.5', odds: '-110' }, open: { line: 'o52.5', odds: '-110' } },
    under: { close: { line: 'u47.5', odds: '-110' }, open: { line: 'u52.5', odds: '-110' } },
  },
};

const realEvent = {
  id: '401872980',
  date: '2026-10-09T00:15Z',
  week: { number: 5 },
  season: { year: 2026, type: 2 },
  competitions: [
    {
      id: '401872980',
      status: {
        type: {
          name: 'STATUS_SCHEDULED',
          state: 'pre',
          completed: false,
          shortDetail: '10/8 - 8:15 PM EDT',
        },
      },
      competitors: [
        { homeAway: 'home', score: null, team: { abbreviation: 'DAL', displayName: 'Dallas Cowboys', color: '002244', logo: 'dal.png' } },
        { homeAway: 'away', score: null, team: { abbreviation: 'TB', displayName: 'Tampa Bay Buccaneers', color: 'D50A0A', logo: 'tb.png' } },
      ],
      odds: [realOddsEntry],
    },
  ],
};

describe('parseAmericanOdds', () => {
  it('parses the signed strings ESPN returns', () => {
    expect(parseAmericanOdds('-535')).toBe(-535);
    expect(parseAmericanOdds('+400')).toBe(400);
    expect(parseAmericanOdds('-110')).toBe(-110);
  });

  it('treats a pick-em as +100', () => {
    expect(parseAmericanOdds('EVEN')).toBe(100);
    expect(parseAmericanOdds('PK')).toBe(100);
  });

  it('rejects placeholders rather than coercing them to zero', () => {
    for (const raw of ['', ' ', '-', '--', null, undefined, {}]) {
      expect(parseAmericanOdds(raw)).toBeNull();
    }
  });

  it('rejects impossible prices between -100 and +100', () => {
    // No sportsbook prices inside this range; such a string means we have
    // misread the field, and storing it would corrupt payout display.
    expect(parseAmericanOdds('50')).toBeNull();
    expect(parseAmericanOdds('-99')).toBeNull();
    expect(parseAmericanOdds('0')).toBeNull();
  });

  it('accepts numbers as well as strings', () => {
    expect(parseAmericanOdds(-150)).toBe(-150);
    expect(parseAmericanOdds(NaN)).toBeNull();
  });
});

describe('parseLineValue', () => {
  it('strips the over/under prefix from total lines', () => {
    expect(parseLineValue('o47.5')).toBe(47.5);
    expect(parseLineValue('u47.5')).toBe(47.5);
  });

  it('keeps the sign on spread lines', () => {
    expect(parseLineValue('-9.5')).toBe(-9.5);
    expect(parseLineValue('+9.5')).toBe(9.5);
  });

  it('reads a pick-em spread as zero', () => {
    expect(parseLineValue('PK')).toBe(0);
    expect(parseLineValue('EVEN')).toBe(0);
  });

  it('distinguishes a zero line from a missing one', () => {
    // 0 is a real spread; null means no line was posted. Conflating them would
    // let a pick be stored with no line at all.
    expect(parseLineValue('0')).toBe(0);
    expect(parseLineValue('')).toBeNull();
    expect(parseLineValue(null)).toBeNull();
  });
});

describe('parseGameStatus', () => {
  it('maps the three states', () => {
    expect(parseGameStatus({ name: 'STATUS_SCHEDULED', state: 'pre' })).toBe('scheduled');
    expect(parseGameStatus({ name: 'STATUS_IN_PROGRESS', state: 'in' })).toBe('in_progress');
    expect(parseGameStatus({ name: 'STATUS_FINAL', state: 'post', completed: true })).toBe('final');
  });

  it('treats every mid-game state as in_progress', () => {
    // Observed live: halftime games report STATUS_HALFTIME, which must not
    // read as scheduled or the status trigger would reject the next update.
    expect(parseGameStatus({ name: 'STATUS_HALFTIME', state: 'in' })).toBe('in_progress');
    expect(parseGameStatus({ name: 'STATUS_END_PERIOD', state: 'in' })).toBe('in_progress');
    expect(parseGameStatus({ name: 'STATUS_DELAYED', state: 'in' })).toBe('in_progress');
  });

  it('trusts the completed flag over the state', () => {
    expect(parseGameStatus({ name: 'STATUS_FINAL', state: 'in', completed: true })).toBe('final');
  });

  it('maps postponed and cancelled games', () => {
    expect(parseGameStatus({ name: 'STATUS_POSTPONED', state: 'pre' })).toBe('postponed');
    expect(parseGameStatus({ name: 'STATUS_CANCELED', state: 'post' })).toBe('postponed');
  });

  it('falls back to scheduled on an unknown shape', () => {
    expect(parseGameStatus({})).toBe('scheduled');
    expect(parseGameStatus(null)).toBe('scheduled');
  });
});

describe('parseOddsEntry', () => {
  const rows = parseOddsEntry(realOddsEntry, 'DAL', 'TB');

  it('produces one row per market per side', () => {
    expect(rows).toHaveLength(6);
  });

  it('assigns moneyline prices to the correct teams', () => {
    const home = rows.find((r) => r.marketType === 'moneyline' && r.selection === 'home');
    const away = rows.find((r) => r.marketType === 'moneyline' && r.selection === 'away');
    expect(home).toMatchObject({ teamAbbr: 'DAL', americanOdds: -535, line: null });
    expect(away).toMatchObject({ teamAbbr: 'TB', americanOdds: 400, line: null });
  });

  it('gives each side of the spread its own signed line', () => {
    const home = rows.find((r) => r.marketType === 'spread' && r.selection === 'home');
    const away = rows.find((r) => r.marketType === 'spread' && r.selection === 'away');
    expect(home).toMatchObject({ teamAbbr: 'DAL', line: -9.5, americanOdds: -110 });
    expect(away).toMatchObject({ teamAbbr: 'TB', line: 9.5, americanOdds: -110 });
  });

  it('uses the closing line, not the opening one', () => {
    // The open was -3.5 and the close -9.5. Freezing the open would offer
    // players a line the book no longer stands behind.
    const home = rows.find((r) => r.marketType === 'spread' && r.selection === 'home');
    expect(home?.line).toBe(-9.5);
  });

  it('gives over and under the same number with no team', () => {
    const over = rows.find((r) => r.selection === 'over');
    const under = rows.find((r) => r.selection === 'under');
    expect(over).toMatchObject({ line: 47.5, teamAbbr: null, americanOdds: -110 });
    expect(under).toMatchObject({ line: 47.5, teamAbbr: null, americanOdds: -110 });
  });

  it('derives the away spread from the flat field when the nested one is absent', () => {
    const legacy = { spread: -3, overUnder: 44.5 };
    const parsed = parseOddsEntry(legacy, 'KC', 'BUF');
    expect(parsed.find((r) => r.selection === 'home' && r.marketType === 'spread')?.line).toBe(-3);
    expect(parsed.find((r) => r.selection === 'away' && r.marketType === 'spread')?.line).toBe(3);
  });

  it('returns nothing for an empty entry rather than zeroed rows', () => {
    expect(parseOddsEntry({}, 'KC', 'BUF')).toHaveLength(0);
  });
});

describe('parseEvent', () => {
  it('parses a real scheduled event', () => {
    const game = parseEvent(realEvent);
    expect(game).toMatchObject({
      espnId: '401872980',
      season: 2026,
      week: 5,
      homeAbbr: 'DAL',
      awayAbbr: 'TB',
      status: 'scheduled',
      provider: 'DraftKings',
      homeScore: null,
      awayScore: null,
    });
    expect(game?.odds).toHaveLength(6);
    expect(game?.startTime).toBe('2026-10-09T00:15:00.000Z');
  });

  it('prefixes team colours for CSS', () => {
    expect(parseEvent(realEvent)?.homeColor).toBe('#002244');
  });

  it('returns an empty odds list for an in-progress game', () => {
    // Confirmed against the live feed: ESPN drops the odds array at kickoff.
    // Callers must keep previously captured lines rather than clearing them.
    const live = {
      ...realEvent,
      competitions: [
        {
          ...realEvent.competitions[0],
          odds: [],
          status: { type: { name: 'STATUS_HALFTIME', state: 'in', completed: false } },
          competitors: [
            { homeAway: 'home', score: '9', team: { abbreviation: 'DAL' } },
            { homeAway: 'away', score: '0', team: { abbreviation: 'TB' } },
          ],
        },
      ],
    };
    const game = parseEvent(live);
    expect(game?.status).toBe('in_progress');
    expect(game?.odds).toHaveLength(0);
    expect(game?.homeScore).toBe(9);
    expect(game?.awayScore).toBe(0);
  });

  it('reads a zero score as zero, not missing', () => {
    const game = parseEvent({
      ...realEvent,
      competitions: [
        {
          ...realEvent.competitions[0],
          status: { type: { name: 'STATUS_FINAL', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '0', team: { abbreviation: 'DAL' } },
            { homeAway: 'away', score: '24', team: { abbreviation: 'TB' } },
          ],
        },
      ],
    });
    expect(game?.homeScore).toBe(0);
  });

  it('rejects an event missing the fields a game needs', () => {
    expect(parseEvent(null)).toBeNull();
    expect(parseEvent({ id: '1' })).toBeNull();
    expect(parseEvent({ ...realEvent, competitions: [{ competitors: [] }] })).toBeNull();
    expect(parseEvent({ ...realEvent, date: undefined })).toBeNull();
  });

  it('falls back to the requested week when the event omits one', () => {
    const noWeek = { ...realEvent, week: undefined };
    expect(parseEvent(noWeek, 5)?.week).toBe(5);
    expect(parseEvent(noWeek)).toBeNull();
  });
});
