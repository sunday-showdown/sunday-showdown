import { describe, it, expect } from 'vitest';
import { advanceFinishedWeeks } from '../lib/contests';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Fixture {
  leagues: { id: string; current_week: number }[];
  games: { week: number; status: string }[];
  contests: { week: number }[];
}

/** Records what the advance actually wrote, so the test can assert on it. */
function fakeDb(fixture: Fixture) {
  const updates: { ids: string[]; week: number }[] = [];

  const db = {
    from(table: string) {
      const rows =
        table === 'leagues' ? fixture.leagues
        : table === 'nfl_games' ? fixture.games
        : table === 'pickem_challenges' ? fixture.contests
        : null;
      if (rows === null) throw new Error(`unexpected table: ${table}`);

      const self: Record<string, unknown> = {};
      let pendingUpdate: number | null = null;

      for (const method of ['select', 'eq', 'in', 'order']) {
        self[method] = (...args: unknown[]) => {
          // `in('id', ids)` on a pending update is the write we care about.
          if (method === 'in' && pendingUpdate !== null) {
            updates.push({ ids: args[1] as string[], week: pendingUpdate });
            return Promise.resolve({ data: null, error: null });
          }
          return self;
        };
      }
      self.update = (patch: Record<string, number>) => {
        pendingUpdate = patch.current_week!;
        return self;
      };
      self.then = (resolve: (value: { data: unknown; error: null }) => unknown) =>
        resolve({ data: rows, error: null });
      return self;
    },
  } as unknown as SupabaseClient;

  return { db, updates };
}

describe('advanceFinishedWeeks', () => {
  it('moves a league on once every game is final and next week is open', async () => {
    const { db, updates } = fakeDb({
      leagues: [{ id: 'l1', current_week: 4 }],
      games: [
        { week: 4, status: 'final' },
        { week: 4, status: 'final' },
      ],
      contests: [{ week: 4 }, { week: 5 }],
    });

    const report = await advanceFinishedWeeks(db, 2026);
    expect(report).toMatchObject({ leaguesAdvanced: 1, from: 4, to: 5 });
    expect(updates).toEqual([{ ids: ['l1'], week: 5 }]);
  });

  it('waits while a game is still to be played', async () => {
    // The Monday nighter. Advancing here would strand a pickable game.
    const { db, updates } = fakeDb({
      leagues: [{ id: 'l1', current_week: 4 }],
      games: [
        { week: 4, status: 'final' },
        { week: 4, status: 'in_progress' },
      ],
      contests: [{ week: 4 }, { week: 5 }],
    });

    expect(await advanceFinishedWeeks(db, 2026)).toMatchObject({ leaguesAdvanced: 0 });
    expect(updates).toEqual([]);
  });

  it('waits when next week has no contest to move onto', async () => {
    const { db, updates } = fakeDb({
      leagues: [{ id: 'l1', current_week: 4 }],
      games: [{ week: 4, status: 'final' }],
      contests: [{ week: 4 }],
    });

    expect(await advanceFinishedWeeks(db, 2026)).toMatchObject({ leaguesAdvanced: 0 });
    expect(updates).toEqual([]);
  });

  it('does not advance a week with no games at all', async () => {
    // An empty slate is "not published yet", not "finished".
    const { db, updates } = fakeDb({
      leagues: [{ id: 'l1', current_week: 4 }],
      games: [],
      contests: [{ week: 4 }, { week: 5 }],
    });

    expect(await advanceFinishedWeeks(db, 2026)).toMatchObject({ leaguesAdvanced: 0 });
    expect(updates).toEqual([]);
  });

  it('moves each league to its own next week, never to a shared one', async () => {
    // A league a week behind must go to 4, not be dragged to 5 alongside the
    // others — enforce_league_week_forward makes an overshoot permanent.
    const { db, updates } = fakeDb({
      leagues: [
        { id: 'ahead', current_week: 4 },
        { id: 'behind', current_week: 3 },
      ],
      games: [
        { week: 4, status: 'final' },
        { week: 3, status: 'final' },
      ],
      contests: [{ week: 3 }, { week: 4 }, { week: 5 }],
    });

    const report = await advanceFinishedWeeks(db, 2026);
    expect(report.leaguesAdvanced).toBe(2);
    expect(updates).toContainEqual({ ids: ['ahead'], week: 5 });
    expect(updates).toContainEqual({ ids: ['behind'], week: 4 });
  });

  it('does nothing when there are no leagues', async () => {
    const { db, updates } = fakeDb({ leagues: [], games: [], contests: [] });
    expect(await advanceFinishedWeeks(db, 2026)).toMatchObject({ leaguesAdvanced: 0 });
    expect(updates).toEqual([]);
  });
});
