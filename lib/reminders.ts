// Lock reminders.
//
// The single most useful notification this app can send: you have not finished
// your card and the week is about to lock. Sent at a few fixed distances from
// the lock rather than continuously, and keyed to the window so a cron running
// every five minutes nudges once per window rather than every pass.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLockReminders, deliver } from './notifications';

/** Hours before lock at which a reminder goes out. */
export const REMINDER_WINDOWS = [24, 2] as const;

export interface ReminderReport {
  notified: number;
  contestsChecked: number;
  warnings: string[];
}

/**
 * Which window a lock falls into, or null if it is not near one.
 *
 * A window is the hour leading up to its mark, so a job running every five
 * minutes finds the same window repeatedly and the notification key makes
 * all but the first a no-op.
 */
export function windowFor(hoursUntilLock: number): number | null {
  if (hoursUntilLock <= 0) return null;
  for (const mark of REMINDER_WINDOWS) {
    if (hoursUntilLock <= mark && hoursUntilLock > mark - 1) return mark;
  }
  return null;
}

/** Notify anyone with an unfinished card as a lock approaches. */
export async function sendLockReminders(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<ReminderReport> {
  const report: ReminderReport = { notified: 0, contestsChecked: 0, warnings: [] };

  const { data: contests, error } = await db
    .from('pickem_challenges')
    .select('id, league_id, season, week, lock_time')
    .gt('lock_time', now.toISOString())
    .lt('lock_time', new Date(now.getTime() + 25 * 3600_000).toISOString());

  if (error) throw new Error(`failed to read contests: ${error.message}`);
  if (!contests || contests.length === 0) return report;

  for (const contest of contests) {
    const hoursLeft = (new Date(contest.lock_time as string).getTime() - now.getTime()) / 3600_000;
    const mark = windowFor(hoursLeft);
    if (mark === null) continue;

    report.contestsChecked += 1;

    const { count: total } = await db
      .from('nfl_games')
      .select('id', { count: 'exact', head: true })
      .eq('season', contest.season)
      .eq('week', contest.week);

    const slate = total ?? 0;
    if (slate === 0) continue;

    const { data: members } = await db
      .from('league_members')
      .select('user_id')
      .eq('league_id', contest.league_id);

    if (!members || members.length === 0) continue;

    const { data: picks } = await db
      .from('picks')
      .select('user_id')
      .eq('challenge_id', contest.id);

    const pickedBy = new Map<string, number>();
    for (const pick of picks ?? []) {
      const id = pick.user_id as string;
      pickedBy.set(id, (pickedBy.get(id) ?? 0) + 1);
    }

    const incomplete = members
      .map((m) => ({
        userId: m.user_id as string,
        picked: pickedBy.get(m.user_id as string) ?? 0,
        total: slate,
      }))
      .filter((entry) => entry.picked < entry.total);

    if (incomplete.length === 0) continue;

    const result = await deliver(
      db,
      buildLockReminders({
        season: contest.season as number,
        week: contest.week as number,
        hoursLeft: mark,
        incomplete,
      }),
    );

    report.notified += result.created;
    report.warnings.push(...result.warnings);
  }

  return report;
}
