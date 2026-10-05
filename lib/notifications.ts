// Notifications.
//
// In-app only for now: a bell with unread counts, driven by the same events
// that feed the league activity. Web push would need a service-worker
// subscription and a push provider; the subscription column exists on
// notification_preferences for when that lands.
//
// Every notification carries a deterministic key in `data.key`, and a partial
// unique index makes writing one twice a no-op — which matters because grading
// runs every few minutes and would otherwise re-notify the same result.

import type { SupabaseClient } from '@supabase/supabase-js';

export type NotificationType =
  | 'deadline_approaching'
  | 'picks_locked'
  | 'game_final'
  | 'first_place'
  | 'passed_in_standings'
  | 'td_scored'
  | 'weekly_results'
  | 'achievements'
  | 'h2h_received'
  | 'h2h_result'
  | 'mention'
  | 'direct_message';

export interface NotificationDraft {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  key: string;
  data?: Record<string, unknown>;
}

/**
 * Which preference column gates a type.
 *
 * Types without a column (a challenge arriving, say) are always delivered —
 * they are direct and personal, not a digest.
 */
const PREFERENCE_COLUMN: Partial<Record<NotificationType, string>> = {
  deadline_approaching: 'deadline_approaching',
  picks_locked: 'picks_locked',
  game_final: 'game_final',
  first_place: 'first_place',
  passed_in_standings: 'passed_in_standings',
  td_scored: 'td_scored',
  weekly_results: 'weekly_results',
  achievements: 'achievements',
};

export interface DeliveryReport {
  created: number;
  suppressed: number;
  warnings: string[];
}

/**
 * Write notifications, respecting each recipient's preferences.
 *
 * One preferences read for everyone involved rather than one per notification.
 */
export async function deliver(
  db: SupabaseClient,
  drafts: readonly NotificationDraft[],
): Promise<DeliveryReport> {
  const report: DeliveryReport = { created: 0, suppressed: 0, warnings: [] };
  if (drafts.length === 0) return report;

  const userIds = [...new Set(drafts.map((d) => d.userId))];
  const { data: preferences, error } = await db
    .from('notification_preferences')
    .select('*')
    .in('user_id', userIds);

  if (error) {
    report.warnings.push(`preferences: ${error.message}`);
    return report;
  }

  const prefsFor = new Map(
    (preferences ?? []).map((p) => [p.user_id as string, p as Record<string, unknown>]),
  );

  const allowed = drafts.filter((draft) => {
    const column = PREFERENCE_COLUMN[draft.type];
    if (!column) return true;
    const prefs = prefsFor.get(draft.userId);
    // No row yet means defaults, and every default is on.
    if (!prefs) return true;
    return prefs[column] !== false;
  });

  report.suppressed = drafts.length - allowed.length;
  if (allowed.length === 0) return report;

  const { error: insertError, count } = await db.from('notifications').upsert(
    allowed.map((draft) => ({
      user_id: draft.userId,
      type: draft.type,
      title: draft.title,
      message: draft.message,
      notification_key: draft.key,
      data: draft.data ?? {},
      is_read: false,
    })),
    { onConflict: 'user_id,notification_key', ignoreDuplicates: true, count: 'exact' },
  );

  if (insertError) {
    report.warnings.push(`notifications: ${insertError.message}`);
    return report;
  }

  report.created = count ?? 0;
  return report;
}

/** Notifications for a graded week. */
export function buildWeeklyNotifications(input: {
  season: number;
  week: number;
  standings: readonly {
    userId: string;
    username: string;
    totalPoints: number;
    rank: number;
    isWinner: boolean;
  }[];
}): NotificationDraft[] {
  const { season, week, standings } = input;

  return standings.map((entry) => ({
    userId: entry.userId,
    type: entry.isWinner ? ('first_place' as const) : ('weekly_results' as const),
    title: entry.isWinner ? `You won week ${week}` : `Week ${week} is in`,
    message: entry.isWinner
      ? `${Math.round(entry.totalPoints)} points, first place. Nicely done.`
      : `You finished ${ordinal(entry.rank)} with ${Math.round(entry.totalPoints)} points.`,
    key: `weekly:${season}:${week}:${entry.userId}`,
    data: { season, week, rank: entry.rank },
  }));
}

/** A nudge for anyone who has not finished their card before the lock. */
export function buildLockReminders(input: {
  season: number;
  week: number;
  hoursLeft: number;
  incomplete: readonly { userId: string; picked: number; total: number }[];
}): NotificationDraft[] {
  const { season, week, hoursLeft, incomplete } = input;

  return incomplete.map((entry) => ({
    userId: entry.userId,
    type: 'deadline_approaching' as const,
    title: `${hoursLeft}h until lock`,
    message:
      entry.picked === 0
        ? `You have not picked week ${week} yet.`
        : `${entry.total - entry.picked} game${entry.total - entry.picked === 1 ? '' : 's'} still open on your card.`,
    // Keyed to the window, not the moment, so a cron firing repeatedly inside
    // the same window does not nag.
    key: `lock:${season}:${week}:${hoursLeft}:${entry.userId}`,
    data: { season, week },
  }));
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
