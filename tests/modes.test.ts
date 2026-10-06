import { describe, it, expect } from 'vitest';
import {
  buildActiveModes,
  sortModes,
  urgentCount,
  type ActiveMode,
  type ModesInput,
} from '../lib/modes';

const input = (over: Partial<ModesInput> = {}): ModesInput => ({
  week: 5,
  cards: [],
  pools: [],
  duels: { incoming: 0, live: 0 },
  playground: [],
  owed: [],
  ...over,
});

const card = (over: Partial<ModesInput['cards'][number]> = {}) => ({
  leagueId: 'l1',
  leagueName: 'Sunday Boys',
  picked: 0,
  slate: 16,
  locked: false,
  tdPicks: 0,
  ...over,
});

const pool = (over: Partial<ModesInput['pools'][number]> = {}) => ({
  poolId: 'p1',
  name: 'Last Man',
  aliveCount: 4,
  memberCount: 9,
  status: 'active',
  eliminated: false,
  pickedThisWeek: false,
  ...over,
});

const find = (modes: ActiveMode[], kind: string) => modes.find((mode) => mode.kind === kind)!;

describe("pick'em rows", () => {
  it('is urgent while the card is open and unfinished', () => {
    const row = find(buildActiveModes(input({ cards: [card({ picked: 9 })] })), 'pickem');
    expect(row.tone).toBe('urgent');
    expect(row.status).toBe('9 of 16 in');
    expect(row.todo).toBe('7 to go');
  });

  it('wants nothing once the card is complete', () => {
    // The bug this screen had: a finished card still said "finish your card".
    const row = find(buildActiveModes(input({ cards: [card({ picked: 16 })] })), 'pickem');
    expect(row.tone).toBe('ok');
    expect(row.todo).toBeNull();
  });

  it('stops asking once the card has locked', () => {
    const row = find(buildActiveModes(input({ cards: [card({ picked: 4, locked: true })] })), 'pickem');
    expect(row.todo).toBeNull();
    expect(row.status).toContain('Locked');
  });

  it('names the league, because somebody in two leagues has two cards', () => {
    const modes = buildActiveModes(
      input({
        cards: [card(), card({ leagueId: 'l2', leagueName: 'Work League' })],
      }),
    );
    const scopes = modes.filter((mode) => mode.kind === 'pickem').map((mode) => mode.scope);
    expect(scopes).toEqual(['Sunday Boys', 'Work League']);
  });

  it('omits a league whose week has no slate yet', () => {
    expect(buildActiveModes(input({ cards: [card({ slate: 0 })] }))).toHaveLength(0);
  });

  it('never makes TD Scorer urgent', () => {
    // It is optional and has its own board; treating it as a chore would make
    // the strip cry wolf.
    const row = find(buildActiveModes(input({ cards: [card()] })), 'td');
    expect(row.tone).toBe('idle');
  });
});

describe('survivor rows', () => {
  it('shows a pool you are in, which was invisible from Home before', () => {
    const row = find(buildActiveModes(input({ pools: [pool()] })), 'survivor');
    expect(row.scope).toBe('Last Man');
    expect(row.status).toBe('Alive · 4 of 9 left');
  });

  it('is urgent until this week’s pick is in', () => {
    expect(find(buildActiveModes(input({ pools: [pool()] })), 'survivor').tone).toBe('urgent');
    expect(
      find(buildActiveModes(input({ pools: [pool({ pickedThisWeek: true })] })), 'survivor').tone,
    ).toBe('ok');
  });

  it('asks nothing of an eliminated player', () => {
    const row = find(buildActiveModes(input({ pools: [pool({ eliminated: true })] })), 'survivor');
    expect(row.status).toBe('Eliminated');
    expect(row.todo).toBeNull();
    expect(row.tone).toBe('out');
  });

  it('asks nothing once the pool is over', () => {
    const row = find(
      buildActiveModes(input({ pools: [pool({ status: 'completed' })] })),
      'survivor',
    );
    expect(row.todo).toBeNull();
  });
});

describe('duel rows', () => {
  it('surfaces an unanswered challenge as urgent, with a badge', () => {
    const row = find(buildActiveModes(input({ duels: { incoming: 2, live: 1 } })), 'h2h');
    expect(row.tone).toBe('urgent');
    expect(row.badge).toBe(2);
  });

  it('shows live fights when nothing needs answering', () => {
    const row = find(buildActiveModes(input({ duels: { incoming: 0, live: 3 } })), 'h2h');
    expect(row.tone).toBe('live');
    expect(row.status).toBe('3 fights on');
  });

  it('says nothing when there are no duels at all', () => {
    expect(buildActiveModes(input()).some((mode) => mode.kind === 'h2h')).toBe(false);
  });

  it('singularises one fight', () => {
    expect(find(buildActiveModes(input({ duels: { incoming: 0, live: 1 } })), 'h2h').status).toBe(
      '1 fight on',
    );
  });
});

describe('money owed', () => {
  it('is urgent until it is claimed', () => {
    const row = find(
      buildActiveModes(
        input({
          owed: [
            { potId: 'pot1', mode: 'survivor', leagueName: 'Sunday Boys', amount: 20, claimed: false },
          ],
        }),
      ),
      'pot',
    );
    expect(row.tone).toBe('urgent');
    expect(row.status).toBe('$20.00 unpaid');
    expect(row.href).toBe('/survivor');
  });

  it('waits on the owner once claimed', () => {
    const row = find(
      buildActiveModes(
        input({ owed: [{ potId: 'p', mode: 'td', leagueName: null, amount: 10, claimed: true }] }),
      ),
      'pot',
    );
    expect(row.tone).toBe('ok');
    expect(row.status).toBe('Waiting on the owner');
  });
});

describe('sortModes', () => {
  it('puts what has a deadline first and what is finished last', () => {
    const modes = buildActiveModes(
      input({
        cards: [card({ picked: 16 })],
        pools: [pool({ eliminated: true }), pool({ poolId: 'p2', name: 'Alive Pool' })],
        duels: { incoming: 1, live: 0 },
      }),
    );

    expect(modes[0]!.tone).toBe('urgent');
    expect(modes[modes.length - 1]!.tone).toBe('idle');
    // Everything urgent precedes everything that is not.
    const firstNonUrgent = modes.findIndex((mode) => mode.tone !== 'urgent');
    expect(modes.slice(firstNonUrgent).every((mode) => mode.tone !== 'urgent')).toBe(true);
  });

  it('is stable, so the strip does not reshuffle between renders', () => {
    const modes = buildActiveModes(input({ cards: [card(), card({ leagueId: 'l2', leagueName: 'A' })] }));
    expect(sortModes(modes)).toEqual(sortModes([...modes].reverse()));
  });
});

describe('urgentCount', () => {
  it('counts only what has a deadline', () => {
    // TD Scorer always has something you could do and is never urgent. Counting
    // every suggestion had Home announcing "3 things need you" on a morning when
    // nothing did.
    const modes = buildActiveModes(
      input({ cards: [card({ picked: 16 })], duels: { incoming: 1, live: 0 } }),
    );
    expect(modes.some((mode) => mode.kind === 'td' && mode.todo !== null)).toBe(true);
    expect(urgentCount(modes)).toBe(1);
  });

  it('is zero when everything is set', () => {
    expect(urgentCount(buildActiveModes(input({ cards: [card({ picked: 16, locked: true })] })))).toBe(0);
  });
});
