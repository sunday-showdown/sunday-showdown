import { describe, it, expect } from 'vitest';
import {
  shrunkRate,
  atLeastOnce,
  opponentFactor,
  usageFactor,
  priceTd,
  bandFor,
  POSITION_PRIOR,
  MAX_PROBABILITY,
  MIN_PROBABILITY,
} from '../lib/td-model';
import { americanToDecimal, pointsForOdds } from '../lib/odds';

describe('atLeastOnce', () => {
  it('is the Poisson relation, not the rate itself', () => {
    // The bug this replaces: a rate above 1 was being used as a probability.
    expect(atLeastOnce(1.75)).toBeCloseTo(0.826, 3);
    expect(atLeastOnce(1.75)).toBeLessThan(1);
  });

  it('matches the rate closely when scoring is rare', () => {
    // At small λ the two are nearly equal, which is why the old model looked
    // fine for ordinary players and only broke at the top.
    expect(atLeastOnce(0.1)).toBeCloseTo(0.095, 3);
  });

  it('never reaches certainty, however high the rate', () => {
    expect(atLeastOnce(10)).toBeLessThan(1);
    expect(atLeastOnce(100)).toBeLessThan(1);
  });

  it('is zero for a player who cannot score', () => {
    expect(atLeastOnce(0)).toBe(0);
    expect(atLeastOnce(-1)).toBe(0);
    expect(atLeastOnce(Number.NaN)).toBe(0);
  });
});

describe('shrunkRate', () => {
  it('returns the position prior when nobody has played yet', () => {
    expect(shrunkRate(0, 0, 'RB')).toBeCloseTo(POSITION_PRIOR.RB!, 5);
    expect(shrunkRate(0, 0, 'WR')).toBeCloseTo(POSITION_PRIOR.WR!, 5);
  });

  it('moves toward the player as the sample grows', () => {
    // Same production, more games: the prior's grip loosens.
    const early = shrunkRate(4, 4, 'RB');
    const late = shrunkRate(16, 16, 'RB');
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThan(1);
  });

  it('pulls a hot start back toward the position', () => {
    // Four touchdowns in two games is 2.0 a game; nobody sustains that.
    expect(shrunkRate(4, 2, 'RB')).toBeLessThan(1.0);
    expect(shrunkRate(4, 2, 'RB')).toBeGreaterThan(POSITION_PRIOR.RB!);
  });

  it('does not write off a scoreless start entirely', () => {
    expect(shrunkRate(0, 4, 'WR')).toBeGreaterThan(0);
  });

  it('uses a generic prior for an unknown position', () => {
    expect(shrunkRate(0, 0, null)).toBeCloseTo(0.18, 5);
    expect(shrunkRate(0, 0, 'LS')).toBeCloseTo(0.18, 5);
  });

  it('is case-insensitive about the position', () => {
    expect(shrunkRate(2, 5, 'rb')).toBeCloseTo(shrunkRate(2, 5, 'RB'), 10);
  });

  it('treats nonsense input as nothing rather than throwing', () => {
    expect(shrunkRate(Number.NaN, Number.NaN, 'RB')).toBeCloseTo(POSITION_PRIOR.RB!, 5);
    expect(shrunkRate(-5, -5, 'RB')).toBeCloseTo(POSITION_PRIOR.RB!, 5);
  });
});

describe('opponentFactor', () => {
  it('is neutral against an average defence', () => {
    expect(opponentFactor(22, 22)).toBeCloseTo(1, 5);
  });

  it('lifts a price against a leaky defence and cuts it against a good one', () => {
    expect(opponentFactor(28, 22)).toBeGreaterThan(1);
    expect(opponentFactor(15, 22)).toBeLessThan(1);
  });

  it('clamps, so one blowout cannot reclassify a defence', () => {
    expect(opponentFactor(60, 22)).toBeLessThanOrEqual(1.3);
    expect(opponentFactor(1, 22)).toBeGreaterThanOrEqual(0.78);
  });

  it('is neutral when the data is missing or unusable', () => {
    expect(opponentFactor(null, 22)).toBe(1);
    expect(opponentFactor(22, null)).toBe(1);
    expect(opponentFactor(22, 0)).toBe(1);
    expect(opponentFactor(Number.NaN, 22)).toBe(1);
  });
});

describe('priceTd', () => {
  it('prices the league leader like a sportsbook would, not at -900', () => {
    // The case that exposed the old model. 7 in 4 games is a historic pace and
    // should still land in the range a book actually prints.
    const price = priceTd({ position: 'RB', touchdowns: 7, gamesPlayed: 4 });
    expect(price.americanOdds).toBeGreaterThanOrEqual(-250);
    expect(price.americanOdds).toBeLessThan(0);
    expect(price.probability).toBeLessThanOrEqual(MAX_PROBABILITY);
  });

  it('prices a good-but-ordinary starter around even money', () => {
    // 6 in 10 games: a solid goal-line back.
    const price = priceTd({ position: 'RB', touchdowns: 6, gamesPlayed: 10 });
    expect(price.probability).toBeGreaterThan(0.3);
    expect(price.probability).toBeLessThan(0.5);
  });

  it('prices a scoreless reserve long, but not free', () => {
    const price = priceTd({ position: 'WR', touchdowns: 0, gamesPlayed: 6 });
    expect(price.americanOdds).toBeGreaterThan(300);
    expect(price.probability).toBeGreaterThanOrEqual(MIN_PROBABILITY);
  });

  it('separates players the old tiering lumped together', () => {
    // Two scoreless receivers with different sample sizes are not the same bet.
    const thin = priceTd({ position: 'WR', touchdowns: 0, gamesPlayed: 1 });
    const proven = priceTd({ position: 'WR', touchdowns: 0, gamesPlayed: 12 });
    expect(thin.probability).toBeGreaterThan(proven.probability);
  });

  it('moves a price on the opponent', () => {
    const base = priceTd({ position: 'RB', touchdowns: 4, gamesPlayed: 8 });
    const soft = priceTd({ position: 'RB', touchdowns: 4, gamesPlayed: 8, opponentFactor: 1.3 });
    const tough = priceTd({ position: 'RB', touchdowns: 4, gamesPlayed: 8, opponentFactor: 0.78 });

    expect(soft.probability).toBeGreaterThan(base.probability);
    expect(tough.probability).toBeLessThan(base.probability);
  });

  it('ranks the positions sensibly with no production to go on', () => {
    const rb = priceTd({ position: 'RB', touchdowns: 0, gamesPlayed: 0 });
    const te = priceTd({ position: 'TE', touchdowns: 0, gamesPlayed: 0 });
    const qb = priceTd({ position: 'QB', touchdowns: 0, gamesPlayed: 0 });
    expect(rb.probability).toBeGreaterThan(te.probability);
    expect(te.probability).toBeGreaterThan(qb.probability);
  });

  it('always produces odds a book could print', () => {
    for (const tds of [0, 1, 5, 12, 40]) {
      for (const games of [0, 1, 6, 17]) {
        const { americanOdds } = priceTd({ position: 'RB', touchdowns: tds, gamesPlayed: games });
        expect(Math.abs(americanOdds)).toBeGreaterThanOrEqual(100);
        expect(americanToDecimal(americanOdds)).not.toBeNull();
      }
    }
  });

  it('never prices anyone as a certainty or as impossible', () => {
    const extreme = priceTd({ position: 'RB', touchdowns: 50, gamesPlayed: 1 });
    expect(extreme.probability).toBe(MAX_PROBABILITY);

    const nothing = priceTd({ position: 'FB', touchdowns: 0, gamesPlayed: 17 });
    expect(nothing.probability).toBeGreaterThanOrEqual(MIN_PROBABILITY);
  });
});

describe('bandFor', () => {
  it('bands by what a bettor would call it', () => {
    expect(bandFor(0.5)).toBe('lock');
    expect(bandFor(0.3)).toBe('solid');
    expect(bandFor(0.08)).toBe('longshot');
  });

  it('is display only — the payout comes from the odds', () => {
    // Two players in the same band can be priced differently, which is the
    // whole point of replacing fixed per-tier payouts.
    const a = priceTd({ position: 'RB', touchdowns: 4, gamesPlayed: 10 });
    const b = priceTd({ position: 'RB', touchdowns: 5, gamesPlayed: 10 });
    expect(bandFor(a.probability)).toBe(bandFor(b.probability));
    expect(a.americanOdds).not.toBe(b.americanOdds);
  });
});

describe('usage', () => {
  it('is neutral when usage is unknown', () => {
    expect(usageFactor(null, 10, 'WR')).toBe(1);
    expect(usageFactor(undefined, 10, 'WR')).toBe(1);
    expect(usageFactor(40, 0, 'WR')).toBe(1);
  });

  it('cuts the price of somebody who is barely on the field', () => {
    // Two scoreless receivers: one targeted all game, one who touched the ball
    // twice all season. They are not the same bet.
    const starter = priceTd({ position: 'WR', touchdowns: 0, gamesPlayed: 10, touches: 55 });
    const fringe = priceTd({ position: 'WR', touchdowns: 0, gamesPlayed: 10, touches: 2 });
    expect(starter.probability).toBeGreaterThan(fringe.probability);
    expect(fringe.americanOdds).toBeGreaterThan(starter.americanOdds);
  });

  it('cannot inflate a price much, only deflate it', () => {
    // Heavy involvement is already reflected in having scored.
    expect(usageFactor(1000, 10, 'RB')).toBeLessThanOrEqual(1.15);
    expect(usageFactor(0, 10, 'RB')).toBeGreaterThanOrEqual(0.35);
  });

  it('judges each position against its own workload', () => {
    // Five touches a game is a full WR1 and a backup running back.
    expect(usageFactor(50, 10, 'WR')).toBeGreaterThan(usageFactor(50, 10, 'RB'));
  });
});

describe('unproven players', () => {
  it('does not price somebody who has never played as a likely scorer', () => {
    // The prior alone priced an unseen rookie like a typical starter, which put
    // him near the top of the board on no evidence at all.
    const rookie = priceTd({ position: 'RB', touchdowns: 0, gamesPlayed: 0 });
    const starter = priceTd({ position: 'RB', touchdowns: 6, gamesPlayed: 10, touches: 130 });

    expect(rookie.probability).toBeLessThan(starter.probability);
    expect(bandFor(rookie.probability)).not.toBe('lock');
  });

  it('prices a demonstrated non-scorer longer than an unknown', () => {
    // Eight games of heavy-enough usage and no scores is evidence; never having
    // played is an absence of evidence. The first should be the longer price.
    const rookie = priceTd({ position: 'RB', touchdowns: 0, gamesPlayed: 0 });
    const neverScores = priceTd({ position: 'RB', touchdowns: 0, gamesPlayed: 8, touches: 30 });
    expect(neverScores.americanOdds).toBeGreaterThan(rookie.americanOdds);
  });

  it('still gives them a real price rather than the floor', () => {
    const rookie = priceTd({ position: 'RB', touchdowns: 0, gamesPlayed: 0 });
    expect(rookie.probability).toBeGreaterThan(MIN_PROBABILITY);
    expect(rookie.americanOdds).toBeGreaterThan(300);
  });
});

describe('payout integration', () => {
  it('pays what the odds pay, like every other pick', () => {
    // The model's job ends at a price; lib/odds turns that into points, so a
    // touchdown pick and a spread pick at the same odds are worth the same.
    const price = priceTd({ position: 'RB', touchdowns: 3, gamesPlayed: 8 });
    expect(pointsForOdds(price.americanOdds)).toBeGreaterThan(0);
    expect(pointsForOdds(price.americanOdds)).toBe(pointsForOdds(price.americanOdds));
  });

  it('pays a long shot more than a likely scorer', () => {
    const likely = priceTd({ position: 'RB', touchdowns: 8, gamesPlayed: 10, touches: 150 });
    const unlikely = priceTd({ position: 'WR', touchdowns: 0, gamesPlayed: 10, touches: 8 });
    expect(pointsForOdds(unlikely.americanOdds)).toBeGreaterThan(
      pointsForOdds(likely.americanOdds),
    );
  });
});
