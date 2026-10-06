// Head-to-head as a fight.
//
// A duel used to be a line of text: two numbers and the word WON. The points
// were already there and already meant something, so this converts them into
// the language the screen now speaks — hit points, damage, a knockout — without
// inventing a second scoring system that could disagree with the first.
//
// THE RULE: damage is the gap between two cards, not the size of either.
//
// Both fighters start full. Each round, the player who scored more lands the
// difference; the player who scored less lands nothing. Scoring 60 to 40 is a
// clean hit whether those numbers were 6 and 4 or 160 and 140, which is what
// makes one function work for a quiet Thursday-only slate and a full Sunday.
// Absolute points could not: a 16-game card pays an order of magnitude more
// than a 2-game one, so a fixed points-per-HP rate would make late-season byes
// feel like pillow fights.
//
// Nothing here is affected by which fighter somebody built. Archetypes are
// cosmetic on purpose (see lib/fighters.ts) — a duel is won by picking better,
// and a stat line somebody could min-max would quietly turn that into picking
// better *and* having read the patch notes.

/** Both fighters start here, and zero is a knockout. */
export const MAX_HP = 100;

/**
 * Most damage one round can land.
 *
 * A weekly duel is settled by its single round, so a perfect week — your
 * opponent scored nothing — is a knockout. A season duel needs three such
 * weeks, which over eighteen weeks keeps the fight alive long enough to be
 * worth following while still letting a genuine mauling end early.
 */
export const WEEKLY_CAP = 100;
export const SEASON_ROUND_CAP = 34;

export type Duration = 'week' | 'season';

export function capFor(duration: Duration): number {
  return duration === 'season' ? SEASON_ROUND_CAP : WEEKLY_CAP;
}

export interface RoundDamage {
  /** Damage the challenger dealt to the opponent. */
  challenger: number;
  /** Damage the opponent dealt to the challenger. */
  opponent: number;
}

/**
 * The damage one round's scores produce.
 *
 * Only the leader lands a blow — the gap is a single quantity and handing a
 * share of it to both sides would double-count it, so a season of dead-even
 * weeks would kill both fighters at once.
 *
 * Two zeroes is a tie, not a divide by zero: a week where neither player
 * picked is nobody's win.
 */
export function roundDamage(
  challengerPoints: number,
  opponentPoints: number,
  cap: number = WEEKLY_CAP,
): RoundDamage {
  const mine = Number.isFinite(challengerPoints) ? Math.max(0, challengerPoints) : 0;
  const theirs = Number.isFinite(opponentPoints) ? Math.max(0, opponentPoints) : 0;

  const total = mine + theirs;
  if (total === 0) return { challenger: 0, opponent: 0 };

  // Scaled to the share of the round's points, so the result is independent of
  // how big the slate was.
  const edge = Math.abs(mine - theirs) / total;
  const damage = Math.min(cap, Math.round(cap * edge));

  return mine > theirs
    ? { challenger: damage, opponent: 0 }
    : mine < theirs
      ? { challenger: 0, opponent: damage }
      : { challenger: 0, opponent: 0 };
}

export interface Round {
  week: number;
  challengerPoints: number;
  opponentPoints: number;
  challengerDamage: number;
  opponentDamage: number;
}

export interface BattleState {
  /** Hit points left, floored at zero. */
  challengerHp: number;
  opponentHp: number;
  challengerDamage: number;
  opponentDamage: number;
  /** The week somebody was finished off, or null if both are standing. */
  knockoutWeek: number | null;
  /** Who is winning right now; null is a dead heat. */
  leader: 'challenger' | 'opponent' | null;
}

/**
 * Fold rounds into a running fight.
 *
 * Rounds are replayed in week order so the knockout is attributed to the week
 * it happened in, not to whichever row the database handed back first — and
 * once somebody is down the replay stops, so a late row arriving for a fight
 * that already ended cannot change who won it.
 */
export function playBattle(rounds: readonly Round[]): BattleState {
  const ordered = [...rounds].sort((a, b) => a.week - b.week);

  let challengerDamage = 0;
  let opponentDamage = 0;
  let knockoutWeek: number | null = null;

  for (const round of ordered) {
    challengerDamage += Math.max(0, round.challengerDamage);
    opponentDamage += Math.max(0, round.opponentDamage);

    if (challengerDamage >= MAX_HP || opponentDamage >= MAX_HP) {
      knockoutWeek = round.week;
      break;
    }
  }

  const challengerHp = Math.max(0, MAX_HP - opponentDamage);
  const opponentHp = Math.max(0, MAX_HP - challengerDamage);

  return {
    challengerHp,
    opponentHp,
    challengerDamage,
    opponentDamage,
    knockoutWeek,
    leader:
      challengerDamage > opponentDamage
        ? 'challenger'
        : opponentDamage > challengerDamage
          ? 'opponent'
          : null,
  };
}

export type BattleOutcome = 'challenger' | 'opponent' | 'tie' | 'pending';

/**
 * Whether a fight is over, and who won.
 *
 * A duel ends when somebody is knocked out, or when there are no rounds left
 * to play. A season duel with both fighters standing and weeks remaining is
 * still pending however lopsided it looks — the comeback is the point.
 */
export function battleOutcome(state: BattleState, roundsRemaining: number): BattleOutcome {
  if (state.knockoutWeek === null && roundsRemaining > 0) return 'pending';
  return state.leader ?? 'tie';
}

/**
 * What a blow is called, for the arena.
 *
 * Flavour, and nothing reads it to decide anything — but the bands are here
 * rather than in the component so the copy cannot drift from the numbers it
 * describes.
 */
export function describeDamage(damage: number): string {
  if (damage >= MAX_HP) return 'Knockout';
  if (damage >= 55) return 'Devastating';
  if (damage >= 30) return 'Crushing';
  if (damage >= 15) return 'Clean hit';
  if (damage > 0) return 'Glancing blow';
  return 'Blocked';
}

/** A health bar's tone, so the colour and the number cannot disagree. */
export function hpTone(hp: number): 'healthy' | 'hurt' | 'critical' | 'down' {
  if (hp <= 0) return 'down';
  if (hp <= 25) return 'critical';
  if (hp <= 60) return 'hurt';
  return 'healthy';
}
