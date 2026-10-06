import { describe, it, expect } from 'vitest';
import {
  ARCHETYPES,
  BANNERS,
  NAME_MAX,
  TAUNT_MAX,
  archetypeOf,
  bannerOf,
  defaultFighter,
  fighterRecord,
  isArchetype,
  isBanner,
  validateFighter,
} from '../lib/fighters';

describe('defaultFighter', () => {
  it('names the fighter after the player, so nobody has to invent one first', () => {
    expect(defaultFighter('u1', 'Austin').name).toBe('Austin');
  });

  it('is stable for a user, across processes', () => {
    // A random default would give somebody a different fighter on every render
    // and on every deploy.
    const first = defaultFighter('abc-123', 'Dan');
    const second = defaultFighter('abc-123', 'Dan');
    expect(first).toEqual(second);
  });

  it('spreads players across the archetypes rather than giving everyone the same one', () => {
    const chosen = new Set(
      Array.from({ length: 60 }, (_, i) => defaultFighter(`user-${i}`, 'x').archetype),
    );
    expect(chosen.size).toBeGreaterThan(1);
  });

  it('gives every fighter a football position to go with the silhouette', () => {
    for (const archetype of ARCHETYPES) {
      expect(archetype.position.length).toBeGreaterThan(2);
      expect(archetype.strike.length).toBeGreaterThan(2);
    }
  });

  it('always produces a valid archetype and banner', () => {
    for (let i = 0; i < 40; i += 1) {
      const fighter = defaultFighter(`seed-${i}`, 'Someone');
      expect(isArchetype(fighter.archetype)).toBe(true);
      expect(isBanner(fighter.banner)).toBe(true);
    }
  });

  it('falls back when the username is too short to be a fighter name', () => {
    expect(defaultFighter('u2', 'a').name).toBe('Challenger');
    expect(defaultFighter('u3', '').name).toBe('Challenger');
  });

  it('truncates a long username rather than failing the length constraint', () => {
    const fighter = defaultFighter('u4', 'x'.repeat(40));
    expect(fighter.name.length).toBe(NAME_MAX);
  });

  it('starts with an empty record', () => {
    const fighter = defaultFighter('u5', 'Sam');
    expect(fighterRecord(fighter)).toBe('0-0');
  });
});

describe('validateFighter', () => {
  const valid = { name: 'Ironjaw', archetype: 'centurion', banner: 'gold', taunt: 'Bring it.' };

  it('accepts a complete draft', () => {
    const result = validateFighter(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.taunt).toBe('Bring it.');
  });

  it('collapses runs of whitespace in a name', () => {
    const result = validateFighter({ ...valid, name: '  The   Hammer  ' });
    expect(result.ok && result.draft.name).toBe('The Hammer');
  });

  it('refuses a name that is too short or too long', () => {
    expect(validateFighter({ ...valid, name: 'x' }).ok).toBe(false);
    expect(validateFighter({ ...valid, name: 'y'.repeat(NAME_MAX + 1) }).ok).toBe(false);
  });

  it('refuses an archetype or banner it does not know', () => {
    // The database has no foreign key for these, so this is the only thing
    // standing between a typo and an unrenderable fighter.
    expect(validateFighter({ ...valid, archetype: 'god-mode' }).ok).toBe(false);
    expect(validateFighter({ ...valid, banner: '#000000' }).ok).toBe(false);
  });

  it('refuses the retired fantasy archetypes', () => {
    // These shipped before the fighters became football gladiators. Migration
    // 0025 remaps the stored rows; this makes sure nothing writes one back.
    for (const retired of ['brawler', 'gladiator', 'duelist', 'berserker', 'oracle', 'titan']) {
      expect(validateFighter({ ...valid, archetype: retired }).ok).toBe(false);
    }
  });

  it('treats a blank taunt as no taunt', () => {
    const result = validateFighter({ ...valid, taunt: '   ' });
    expect(result.ok && result.draft.taunt).toBeNull();
  });

  it('refuses a taunt longer than the column allows', () => {
    expect(validateFighter({ ...valid, taunt: 'z'.repeat(TAUNT_MAX + 1) }).ok).toBe(false);
  });

  it('accepts every archetype and banner the UI offers', () => {
    for (const archetype of ARCHETYPES) {
      for (const banner of BANNERS) {
        expect(validateFighter({ ...valid, archetype: archetype.id, banner: banner.id }).ok).toBe(
          true,
        );
      }
    }
  });
});

describe('lookups', () => {
  it('falls back rather than returning undefined for an unknown id', () => {
    // These render directly, so a missing row has to produce a fighter rather
    // than a blank plinth.
    expect(archetypeOf('nope')).toBe(ARCHETYPES[0]);
    expect(archetypeOf(null)).toBe(ARCHETYPES[0]);
    expect(bannerOf(undefined)).toBe(BANNERS[0]);
  });

  it('shows draws only when there are some', () => {
    expect(fighterRecord({ wins: 3, losses: 1, draws: 0 })).toBe('3-1');
    expect(fighterRecord({ wins: 3, losses: 1, draws: 2 })).toBe('3-1-2');
  });
});
