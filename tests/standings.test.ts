import { describe, it, expect } from 'vitest';
import { loadSeasonStandings } from '../lib/standings';
import type { SupabaseClient } from '@supabase/supabase-js';

interface WeeklyResult {
  user_id: string;
  total_points: number;
  correct_ml: number;
  correct_spread: number;
  correct_totals: number;
  is_winner: boolean;
  week: number;
}

/**
 * The two queries loadSeasonStandings makes, and nothing else.
 *
 * Deliberately not a general Supabase mock: it answers `weekly_results` and
 * `profiles`, and anything else throws, so a third query added to the loader
 * fails loudly here instead of silently returning undefined.
 */
function fakeDb(results: WeeklyResult[], names: Record<string, string>): SupabaseClient {
  const chain = (data: unknown) => {
    const self: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'returns']) {
      self[method] = () => self;
    }
    self.then = (resolve: (value: { data: unknown; error: null }) => unknown) =>
      resolve({ data, error: null });
    return self;
  };

  return {
    from(table: string) {
      if (table === 'weekly_results') return chain(results);
      if (table === 'profiles') {
        return chain(Object.entries(names).map(([user_id, username]) => ({ user_id, username })));
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

function week(
  weekNumber: number,
  points: Record<string, number>,
  winner?: string,
): WeeklyResult[] {
  return Object.entries(points).map(([user_id, total_points]) => ({
    user_id,
    total_points,
    correct_ml: 0,
    correct_spread: 0,
    correct_totals: 0,
    is_winner: user_id === winner,
    week: weekNumber,
  }));
}

const NAMES = { u1: 'austin', u2: 'brian', u3: 'casey' };

describe('loadSeasonStandings', () => {
  it('totals the season and ranks by points', async () => {
    const rows = await loadSeasonStandings(
      fakeDb([...week(1, { u1: 50, u2: 80 }), ...week(2, { u1: 90, u2: 10 })], NAMES),
      'league',
      2026,
    );

    expect(rows.map((r) => [r.username, r.totalPoints, r.rank])).toEqual([
      ['austin', 140, 1],
      ['brian', 90, 2],
    ]);
  });

  it('breaks a points tie on weeks won', async () => {
    const rows = await loadSeasonStandings(
      fakeDb([...week(1, { u1: 50, u2: 50 }, 'u1'), ...week(2, { u1: 50, u2: 50 }, 'u1')], NAMES),
      'league',
      2026,
    );
    expect(rows[0]!.username).toBe('austin');
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(2);
  });

  it('gives a genuine tie the same rank and consumes the place behind it', async () => {
    const rows = await loadSeasonStandings(
      fakeDb(week(1, { u1: 50, u2: 50, u3: 10 }), NAMES),
      'league',
      2026,
    );
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('is empty when nothing has been graded', async () => {
    expect(await loadSeasonStandings(fakeDb([], NAMES), 'league', 2026)).toEqual([]);
  });
});

describe('standings movement', () => {
  it('reports no movement in the first graded week', async () => {
    // There is nowhere to have moved from, and an arrow on every row in week 1
    // would be noise dressed up as information.
    const rows = await loadSeasonStandings(fakeDb(week(1, { u1: 90, u2: 50 }), NAMES), 'l', 2026);
    expect(rows.map((r) => r.movement)).toEqual([null, null]);
  });

  it('counts places gained and lost over the latest week', async () => {
    const rows = await loadSeasonStandings(
      fakeDb(
        [
          ...week(1, { u1: 10, u2: 50, u3: 90 }), // casey, brian, austin
          ...week(2, { u1: 200, u2: 0, u3: 0 }), // austin storms to the front
        ],
        NAMES,
      ),
      'l',
      2026,
    );

    const byName = new Map(rows.map((r) => [r.username, r]));
    expect(byName.get('austin')).toMatchObject({ rank: 1, movement: 2 });
    expect(byName.get('casey')).toMatchObject({ rank: 2, movement: -1 });
    expect(byName.get('brian')).toMatchObject({ rank: 3, movement: -1 });
  });

  it('is zero for somebody who held their place', async () => {
    const rows = await loadSeasonStandings(
      fakeDb([...week(1, { u1: 90, u2: 50 }), ...week(2, { u1: 90, u2: 50 })], NAMES),
      'l',
      2026,
    );
    expect(rows.map((r) => r.movement)).toEqual([0, 0]);
  });

  it('is null for somebody who only appears in the latest week', async () => {
    // Joining mid-season is not a climb from last place.
    const rows = await loadSeasonStandings(
      fakeDb([...week(1, { u1: 90 }), ...week(2, { u1: 10, u2: 200 })], NAMES),
      'l',
      2026,
    );
    const byName = new Map(rows.map((r) => [r.username, r]));
    expect(byName.get('brian')!.movement).toBeNull();
    // Austin is not unmoved — he was first and has been passed by the arrival.
    expect(byName.get('austin')).toMatchObject({ rank: 2, movement: -1 });
  });

  it('measures from the latest week present, not from week 1', async () => {
    const rows = await loadSeasonStandings(
      fakeDb(
        [
          ...week(5, { u1: 100, u2: 10 }),
          ...week(6, { u1: 0, u2: 10 }),
          ...week(7, { u1: 0, u2: 200 }), // brian passes austin in week 7 only
        ],
        NAMES,
      ),
      'l',
      2026,
    );
    const byName = new Map(rows.map((r) => [r.username, r]));
    expect(byName.get('brian')).toMatchObject({ rank: 1, movement: 1 });
    expect(byName.get('austin')).toMatchObject({ rank: 2, movement: -1 });
  });
});
