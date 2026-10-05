import { describe, it, expect } from 'vitest';
import { evaluateAchievements, type AchievementContext } from '../lib/achievements';

const base: AchievementContext = {
  userId: 'u1',
  season: 2026,
  week: 5,
  weekResults: [],
  careerWins: 0,
  currentStreak: 0,
  weeklyWins: 0,
  survivorWins: 0,
  weeksPlayed: 1,
  biggestOddsWon: null,
};

const ids = (context: Partial<AchievementContext>) =>
  evaluateAchievements({ ...base, ...context }).map((a) => a.achievementId);

describe('evaluateAchievements', () => {
  it('awards the first pick once anything is settled', () => {
    expect(ids({ weekResults: ['loss'] })).toContain('first_pick');
  });

  it('does not award a first pick for an unsettled card', () => {
    expect(ids({ weekResults: ['pending', 'pending'] })).not.toContain('first_pick');
  });

  it('awards a perfect week only with enough picks', () => {
    expect(ids({ weekResults: Array(6).fill('win') })).toContain('perfect_week');
    // Three correct picks is not an achievement.
    expect(ids({ weekResults: Array(3).fill('win') })).not.toContain('perfect_week');
  });

  it('does not award a perfect week when one pick lost', () => {
    expect(ids({ weekResults: [...Array(5).fill('win'), 'loss'] })).not.toContain('perfect_week');
  });

  it('ignores pending picks when judging a perfect week', () => {
    expect(ids({ weekResults: [...Array(5).fill('win'), 'pending'] })).toContain('perfect_week');
  });

  it('awards streak rungs as they are reached', () => {
    expect(ids({ currentStreak: 4 })).not.toContain('streak_5');
    expect(ids({ currentStreak: 5 })).toContain('streak_5');
    const ten = ids({ currentStreak: 10 });
    expect(ten).toContain('streak_5');
    expect(ten).toContain('streak_10');
  });

  it('awards the underdog badge only for a genuine long shot', () => {
    expect(ids({ biggestOddsWon: 200 })).not.toContain('underdog_hero');
    expect(ids({ biggestOddsWon: 250 })).toContain('underdog_hero');
  });

  it('marks career achievements with no season so they are earned once ever', () => {
    const awards = evaluateAchievements({ ...base, weekResults: ['win'], careerWins: 1 });
    const firstWin = awards.find((a) => a.achievementId === 'first_win');
    expect(firstWin).toMatchObject({ season: null, week: null });
  });

  it('marks seasonal achievements with their season', () => {
    const awards = evaluateAchievements({ ...base, weeklyWins: 1 });
    const weekly = awards.find((a) => a.achievementId === 'weekly_winner');
    expect(weekly).toMatchObject({ season: 2026, week: 5 });
  });

  it('awards a full season only at the end', () => {
    expect(ids({ weeksPlayed: 17 })).not.toContain('full_season');
    expect(ids({ weeksPlayed: 18 })).toContain('full_season');
  });

  it('awards nothing to a player who has done nothing', () => {
    expect(evaluateAchievements(base)).toEqual([]);
  });
});
