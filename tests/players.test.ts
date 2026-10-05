import { describe, it, expect } from 'vitest';
import {
  parseTouchdownLeaders,
  parseRoster,
  athleteIdFromRef,
  SCORING_POSITIONS,
} from '../lib/espn/players';

describe('athleteIdFromRef', () => {
  it('pulls the id out of a core-API ref', () => {
    expect(
      athleteIdFromRef('http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes/3043078?lang=en'),
    ).toBe('3043078');
  });

  it('returns null for anything else', () => {
    expect(athleteIdFromRef('not a url')).toBeNull();
    expect(athleteIdFromRef(null)).toBeNull();
    expect(athleteIdFromRef(undefined)).toBeNull();
  });
});

describe('parseTouchdownLeaders', () => {
  const payload = {
    categories: [
      { name: 'rushingYards', leaders: [{ value: 500, athlete: { $ref: '.../athletes/1' } }] },
      {
        name: 'totalTouchdowns',
        leaders: [
          { value: 6, athlete: { $ref: '.../athletes/3043078' } },
          { value: 4, athlete: { $ref: '.../athletes/4430878' } },
        ],
      },
    ],
  };

  it('reads only the total touchdowns category', () => {
    const counts = parseTouchdownLeaders(payload);
    expect(counts).toEqual([
      { espnId: '3043078', touchdowns: 6 },
      { espnId: '4430878', touchdowns: 4 },
    ]);
  });

  it('returns nothing when the category is absent', () => {
    expect(parseTouchdownLeaders({ categories: [] })).toEqual([]);
    expect(parseTouchdownLeaders(null)).toEqual([]);
  });

  it('skips entries with no usable id or value', () => {
    const broken = {
      categories: [
        {
          name: 'totalTouchdowns',
          leaders: [
            { value: 3, athlete: {} },
            { value: 'lots', athlete: { $ref: '.../athletes/9' } },
            { value: 2, athlete: { $ref: '.../athletes/7' } },
          ],
        },
      ],
    };
    expect(parseTouchdownLeaders(broken)).toEqual([{ espnId: '7', touchdowns: 2 }]);
  });
});

describe('parseRoster', () => {
  const roster = {
    athletes: [
      {
        position: 'offense',
        items: [
          { id: '1', displayName: 'Star Back', position: { abbreviation: 'RB' }, status: { type: 'active' }, headshot: { href: 'rb.png' }, jersey: '22' },
          { id: '2', displayName: 'Big Tackle', position: { abbreviation: 'OT' }, status: { type: 'active' } },
          { id: '3', displayName: 'Hurt Receiver', position: { abbreviation: 'WR' }, status: { type: 'injured' } },
        ],
      },
      {
        position: 'defense',
        items: [{ id: '4', displayName: 'Edge Guy', position: { abbreviation: 'DE' }, status: { type: 'active' } }],
      },
      {
        position: 'practiceSquad',
        items: [{ id: '5', displayName: 'Squad WR', position: { abbreviation: 'WR' }, status: { type: 'active' } }],
      },
    ],
  };

  it('keeps only active offensive skill players', () => {
    const players = parseRoster(roster, 'KC');
    expect(players.map((p) => p.espnId)).toEqual(['1']);
    expect(players[0]).toMatchObject({ name: 'Star Back', position: 'RB', teamAbbr: 'KC', jersey: '22' });
  });

  it('excludes linemen, who are noise on a pick list', () => {
    expect(parseRoster(roster, 'KC').some((p) => p.position === 'OT')).toBe(false);
  });

  it('excludes the practice squad and injured reserve', () => {
    // They cannot score on Sunday.
    const ids = parseRoster(roster, 'KC').map((p) => p.espnId);
    expect(ids).not.toContain('5');
    expect(ids).not.toContain('3');
  });

  it('offers every position that realistically scores', () => {
    expect([...SCORING_POSITIONS].sort()).toEqual(['FB', 'QB', 'RB', 'TE', 'WR']);
  });

  it('returns nothing for a malformed payload rather than throwing', () => {
    expect(parseRoster(null, 'KC')).toEqual([]);
    expect(parseRoster({}, 'KC')).toEqual([]);
  });
});
