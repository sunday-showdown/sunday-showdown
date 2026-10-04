import { describe, it, expect } from 'vitest';
import { parseTeams } from '../lib/espn/teams';

// Shape captured from site.api.espn.com/.../nfl/teams on 2026-10-04.
const payload = {
  sports: [
    {
      leagues: [
        {
          teams: [
            {
              team: {
                id: '22',
                abbreviation: 'ARI',
                name: 'Cardinals',
                location: 'Arizona',
                displayName: 'Arizona Cardinals',
                color: 'a40227',
                alternateColor: 'ffffff',
                isActive: true,
                isAllStar: false,
                logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png' }],
              },
            },
            {
              team: {
                id: '1',
                abbreviation: 'ATL',
                name: 'Falcons',
                location: 'Atlanta',
                displayName: 'Atlanta Falcons',
                color: 'a71930',
                alternateColor: '000000',
                isActive: true,
                isAllStar: false,
                logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nfl/500/atl.png' }],
              },
            },
          ],
        },
      ],
    },
  ],
};

describe('parseTeams', () => {
  it('parses the nested ESPN teams payload', () => {
    const teams = parseTeams(payload);
    expect(teams).toHaveLength(2);
    expect(teams[0]).toEqual({
      abbr: 'ARI',
      espnId: '22',
      name: 'Cardinals',
      city: 'Arizona',
      displayName: 'Arizona Cardinals',
      logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png',
      color: '#a40227',
      altColor: '#ffffff',
    });
  });

  it('prefixes colours for CSS', () => {
    expect(parseTeams(payload)[1]?.color).toBe('#a71930');
  });

  it('skips Pro Bowl and inactive entries', () => {
    // These would otherwise land in nfl_teams and could be referenced by a
    // schedule FK, which is not a real game.
    const withAllStar = {
      sports: [
        {
          leagues: [
            {
              teams: [
                { team: { id: '31', abbreviation: 'NFC', name: 'NFC', isAllStar: true } },
                { team: { id: '32', abbreviation: 'OLD', name: 'Defunct', isActive: false } },
                ...payload.sports[0]!.leagues[0]!.teams,
              ],
            },
          ],
        },
      ],
    };
    const teams = parseTeams(withAllStar);
    expect(teams.map((t) => t.abbr)).toEqual(['ARI', 'ATL']);
  });

  it('skips entries with no abbreviation or id', () => {
    const broken = {
      sports: [{ leagues: [{ teams: [{ team: { name: 'Nameless' } }, { team: null }, {}] }] }],
    };
    expect(parseTeams(broken)).toEqual([]);
  });

  it('returns nothing for a malformed payload rather than throwing', () => {
    expect(parseTeams(null)).toEqual([]);
    expect(parseTeams({})).toEqual([]);
    expect(parseTeams({ sports: [] })).toEqual([]);
  });
});
