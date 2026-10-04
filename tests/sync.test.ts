import { describe, it, expect } from 'vitest';
import { canApplyStatus } from '../lib/espn/sync';
import type { GameStatus } from '../lib/types';

describe('canApplyStatus', () => {
  it('allows forward progression', () => {
    expect(canApplyStatus('scheduled', 'in_progress')).toBe(true);
    expect(canApplyStatus('scheduled', 'final')).toBe(true);
    expect(canApplyStatus('in_progress', 'final')).toBe(true);
  });

  it('allows a final game to be rewritten for a score correction', () => {
    expect(canApplyStatus('final', 'final')).toBe(true);
  });

  it('blocks every regression', () => {
    // A flaky provider response reporting a finished game as scheduled would
    // otherwise un-grade the week and wipe its results.
    expect(canApplyStatus('final', 'scheduled')).toBe(false);
    expect(canApplyStatus('final', 'in_progress')).toBe(false);
    expect(canApplyStatus('in_progress', 'scheduled')).toBe(false);
  });

  it('never lets a postponement undo a completed game', () => {
    expect(canApplyStatus('final', 'postponed')).toBe(false);
  });

  it('accepts a postponement for a game not yet played', () => {
    expect(canApplyStatus('scheduled', 'postponed')).toBe(true);
    expect(canApplyStatus('in_progress', 'postponed')).toBe(true);
  });

  it('lets a postponed game be rescheduled and played', () => {
    // A postponement is not a dead end: the game gets a new date, and must be
    // pickable again when it does.
    expect(canApplyStatus('postponed', 'scheduled')).toBe(true);
    expect(canApplyStatus('postponed', 'in_progress')).toBe(true);
    expect(canApplyStatus('postponed', 'final')).toBe(true);
  });

  it('is idempotent for every status', () => {
    const all: GameStatus[] = ['scheduled', 'in_progress', 'final', 'postponed'];
    for (const status of all) {
      expect(canApplyStatus(status, status)).toBe(true);
    }
  });

  it('makes final terminal apart from a score correction', () => {
    const all: GameStatus[] = ['scheduled', 'in_progress', 'postponed'];
    for (const to of all) {
      expect(canApplyStatus('final', to)).toBe(false);
    }
    expect(canApplyStatus('final', 'final')).toBe(true);
  });

  it('agrees with the database trigger on every transition', () => {
    // The schema's enforce_game_status_progression blocks exactly two things:
    // anything out of final, and in_progress -> scheduled. If this helper were
    // stricter, it would silently skip updates the database would have taken;
    // if looser, the batch would raise. They must match.
    const all: GameStatus[] = ['scheduled', 'in_progress', 'final', 'postponed'];
    const triggerAllows = (from: GameStatus, to: GameStatus) => {
      if (from === to) return true;
      if (from === 'final') return false;
      if (from === 'in_progress' && to === 'scheduled') return false;
      return true;
    };
    for (const from of all) {
      for (const to of all) {
        expect(canApplyStatus(from, to)).toBe(triggerAllows(from, to));
      }
    }
  });
});
