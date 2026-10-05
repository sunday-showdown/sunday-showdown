// Achievements.
//
// Awarded by the system from what already happened, never claimed. The
// catalogue lives in the achievements table (seeded in migration 0007) and
// user_achievements has unique indexes so awarding twice is a no-op.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AchievementContext {
  userId: string;
  season: number;
  week: number;
  /** Settled picks this week, in the order they were graded. */
  weekResults: readonly string[];
  careerWins: number;
  currentStreak: number;
  weeklyWins: number;
  survivorWins: number;
  weeksPlayed: number;
  biggestOddsWon: number | null;
}

export interface Award {
  userId: string;
  achievementId: string;
  /** Null for career achievements, which are earned once ever. */
  season: number | null;
  week: number | null;
}

/**
 * Which achievements a player has just earned.
 *
 * Pure, so the rules can be read and tested in one place rather than being
 * scattered through grading.
 */
export function evaluateAchievements(context: AchievementContext): Award[] {
  const awards: Award[] = [];
  const { userId, season, week } = context;

  const career = (achievementId: string) =>
    awards.push({ userId, achievementId, season: null, week: null });
  const seasonal = (achievementId: string) =>
    awards.push({ userId, achievementId, season, week });

  const settled = context.weekResults.filter((r) => r !== 'pending');
  const wins = settled.filter((r) => r === 'win').length;

  if (settled.length > 0) career('first_pick');
  if (context.careerWins >= 1) career('first_win');

  // A perfect week needs enough picks to be an achievement rather than luck.
  if (settled.length >= 5 && wins === settled.length) seasonal('perfect_week');
  if (context.weeklyWins >= 1) seasonal('weekly_winner');

  if (context.currentStreak >= 5) seasonal('streak_5');
  if (context.currentStreak >= 10) seasonal('streak_10');

  if (context.biggestOddsWon !== null && context.biggestOddsWon >= 250) seasonal('underdog_hero');
  if (context.survivorWins >= 1) seasonal('survivor_champion');
  if (context.weeksPlayed >= 18) seasonal('full_season');

  return awards;
}

export interface AwardReport {
  granted: number;
  warnings: string[];
}

/**
 * Record awards, ignoring any already held.
 *
 * The unique indexes on user_achievements do the deduplication, so this is
 * safe to call on every grading run.
 */
export async function grantAchievements(
  db: SupabaseClient,
  awards: readonly Award[],
): Promise<AwardReport> {
  const report: AwardReport = { granted: 0, warnings: [] };
  if (awards.length === 0) return report;

  const { error, count } = await db.from('user_achievements').upsert(
    awards.map((a) => ({
      user_id: a.userId,
      achievement_id: a.achievementId,
      season: a.season,
      week: a.week,
    })),
    { ignoreDuplicates: true, count: 'exact' },
  );

  if (error) {
    report.warnings.push(`achievements: ${error.message}`);
    return report;
  }

  report.granted = count ?? 0;
  return report;
}
