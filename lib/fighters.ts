// The fighter you bring to a duel.
//
// Purely cosmetic, and deliberately so. A duel is decided by whose card scored
// more (lib/battle.ts); if an archetype granted extra damage or armour then a
// duel would be decided by picking well *and* by having read the stat table,
// and the first person to work out the best build would simply have it. So an
// archetype buys you a silhouette, a colour and a name for your big swing.
//
// Everybody has a fighter whether or not they ever open the builder, because an
// arena with an empty plinth in it looks broken. defaultFighter() derives one
// from the username so a first duel looks finished, and saving over it is the
// only thing the builder does.

export const ARCHETYPES = [
  {
    id: 'brawler',
    name: 'Brawler',
    blurb: 'Swings first, asks later.',
    glyph: '🪓',
    strike: 'Haymaker',
  },
  {
    id: 'gladiator',
    name: 'Gladiator',
    blurb: 'Shield up, sand in the eyes.',
    glyph: '🛡️',
    strike: 'Shield bash',
  },
  {
    id: 'duelist',
    name: 'Duelist',
    blurb: 'All precision, no wasted motion.',
    glyph: '🗡️',
    strike: 'Riposte',
  },
  {
    id: 'berserker',
    name: 'Berserker',
    blurb: 'Two axes. No plan.',
    glyph: '⚔️',
    strike: 'Frenzy',
  },
  {
    id: 'oracle',
    name: 'Oracle',
    blurb: 'Saw this coming on Tuesday.',
    glyph: '🔮',
    strike: 'Foresight',
  },
  {
    id: 'titan',
    name: 'Titan',
    blurb: 'Slow, enormous, inevitable.',
    glyph: '🗿',
    strike: 'Earthshaker',
  },
] as const;

export type ArchetypeId = (typeof ARCHETYPES)[number]['id'];
export type Archetype = (typeof ARCHETYPES)[number];

export function isArchetype(value: unknown): value is ArchetypeId {
  return typeof value === 'string' && ARCHETYPES.some((a) => a.id === value);
}

export function archetypeOf(id: string | null | undefined): Archetype {
  return ARCHETYPES.find((a) => a.id === id) ?? ARCHETYPES[0];
}

/**
 * Banner colours.
 *
 * A fixed palette rather than a colour picker: every one of these reads on the
 * near-black arena floor, and a free picker would let somebody choose the
 * background colour and vanish.
 */
export const BANNERS = [
  { id: 'crimson', name: 'Crimson', from: '#f01219', to: '#7d0a10' },
  { id: 'gold', name: 'Gold', from: '#ffc43c', to: '#9c6b00' },
  { id: 'jade', name: 'Jade', from: '#2acd70', to: '#0d5f33' },
  { id: 'cobalt', name: 'Cobalt', from: '#3b82f6', to: '#17356f' },
  { id: 'violet', name: 'Violet', from: '#a855f7', to: '#4c1d75' },
  { id: 'ember', name: 'Ember', from: '#ff9530', to: '#8a3f00' },
  { id: 'bone', name: 'Bone', from: '#e7e2d9', to: '#7d766a' },
] as const;

export type BannerId = (typeof BANNERS)[number]['id'];
export type Banner = (typeof BANNERS)[number];

export function isBanner(value: unknown): value is BannerId {
  return typeof value === 'string' && BANNERS.some((b) => b.id === value);
}

export function bannerOf(id: string | null | undefined): Banner {
  return BANNERS.find((b) => b.id === id) ?? BANNERS[0];
}

export interface Fighter {
  userId: string;
  name: string;
  archetype: ArchetypeId;
  banner: BannerId;
  /** Shown when a challenge lands. Optional, and usually the best part. */
  taunt: string | null;
  wins: number;
  losses: number;
  draws: number;
}

export const NAME_MIN = 2;
export const NAME_MAX = 18;
export const TAUNT_MAX = 80;

/**
 * A fighter name is the username with the decoration a ring announcer would
 * add, so nobody has to invent one before their first fight.
 */
export function defaultFighter(userId: string, username: string): Fighter {
  const trimmed = (username ?? '').trim();
  const name = trimmed.length >= NAME_MIN ? trimmed.slice(0, NAME_MAX) : 'Challenger';

  return {
    userId,
    name,
    // Spread deterministically rather than giving everybody the same silhouette:
    // two identical grey fighters facing each other reads as a loading state.
    archetype: ARCHETYPES[hashOf(userId) % ARCHETYPES.length]!.id,
    banner: BANNERS[hashOf(`${userId}:banner`) % BANNERS.length]!.id,
    taunt: null,
    wins: 0,
    losses: 0,
    draws: 0,
  };
}

/** Stable across processes and deploys, which `Math.random` would not be. */
function hashOf(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export interface FighterDraft {
  name: string;
  archetype: ArchetypeId;
  banner: BannerId;
  taunt: string | null;
}

/**
 * Validate what the builder submitted.
 *
 * Returns the cleaned draft or the reason it was refused, so the API and the
 * form agree about the rules instead of each carrying half of them.
 */
export function validateFighter(input: {
  name?: unknown;
  archetype?: unknown;
  banner?: unknown;
  taunt?: unknown;
}): { ok: true; draft: FighterDraft } | { ok: false; error: string } {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < NAME_MIN) return { ok: false, error: 'Give your fighter a name.' };
  if (name.length > NAME_MAX) {
    return { ok: false, error: `Keep the name to ${NAME_MAX} characters.` };
  }
  if (!isArchetype(input.archetype)) return { ok: false, error: 'Pick a fighting style.' };
  if (!isBanner(input.banner)) return { ok: false, error: 'Pick a banner colour.' };

  const rawTaunt = typeof input.taunt === 'string' ? input.taunt.trim() : '';
  if (rawTaunt.length > TAUNT_MAX) {
    return { ok: false, error: `Keep the taunt to ${TAUNT_MAX} characters.` };
  }

  return {
    ok: true,
    draft: {
      name,
      archetype: input.archetype,
      banner: input.banner,
      taunt: rawTaunt.length > 0 ? rawTaunt : null,
    },
  };
}

/** A win-loss line, with draws only when there are any. */
export function fighterRecord(fighter: Pick<Fighter, 'wins' | 'losses' | 'draws'>): string {
  return fighter.draws > 0
    ? `${fighter.wins}-${fighter.losses}-${fighter.draws}`
    : `${fighter.wins}-${fighter.losses}`;
}
