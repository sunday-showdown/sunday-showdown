// Notifications.
//
// The bell and its unread counts, driven by the same events that feed league
// activity. Web push rides on top of this rather than beside it: see lib/notify.ts,
// which pushes exactly the notifications this module decided were new.
//
// Every notification carries a deterministic key, and a partial unique index
// makes writing one twice a no-op — which matters because grading runs every
// few minutes and would otherwise re-notify the same result. That property is
// also what makes push safe: a repeated run creates nothing, so it buzzes
// nobody's phone a second time.

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
  | 'duel_round'
  | 'duel_close'
  | 'survivor_eliminated'
  | 'mention'
  | 'direct_message';

export interface NotificationDraft {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  key: string;
  data?: Record<string, unknown>;
  /** Where tapping it should land, in-app and from a push. */
  url?: string;
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
  /**
   * Whose notification was genuinely new.
   *
   * Push reads this rather than the recipient list: a draft that collided with
   * an existing key created nothing, so pushing for it would be a second buzz
   * for a result somebody already has.
   */
  createdFor: string[];
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
  const report: DeliveryReport = { created: 0, suppressed: 0, createdFor: [], warnings: [] };
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

  // `select()` rather than a count: with ignoreDuplicates the rows that come
  // back are exactly the ones that did not already exist, which is the set push
  // needs.
  const { data: inserted, error: insertError } = await db
    .from('notifications')
    .upsert(
      allowed.map((draft) => ({
        user_id: draft.userId,
        type: draft.type,
        title: draft.title,
        message: draft.message,
        notification_key: draft.key,
        data: { ...(draft.data ?? {}), ...(draft.url ? { url: draft.url } : {}) },
        is_read: false,
      })),
      { onConflict: 'user_id,notification_key', ignoreDuplicates: true },
    )
    .select('user_id');

  if (insertError) {
    report.warnings.push(`notifications: ${insertError.message}`);
    return report;
  }

  report.createdFor = ((inserted ?? []) as { user_id: string }[]).map((row) => row.user_id);
  report.created = report.createdFor.length;
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
    // Straight to the recap rather than to Home: the notification is about one
    // week, and the screen that explains it is the one that shows that week.
    url: `/recap?week=${week}`,
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
    url: '/picks',
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

/**
 * A challenge landing in somebody's inbox.
 *
 * Not gated by a preference column — being called out is direct and personal,
 * not a digest, and somebody who does not want duels can decline them.
 */
export function buildDuelInvite(input: {
  challengeId: string;
  opponentId: string;
  challengerName: string;
  duration: 'week' | 'season';
  week: number;
  taunt: string | null;
}): NotificationDraft {
  const { challengeId, opponentId, challengerName, duration, week, taunt } = input;

  return {
    userId: opponentId,
    type: 'h2h_received',
    title: `${challengerName} called you out`,
    message:
      taunt && taunt.length > 0
        ? `"${taunt}"`
        : duration === 'season'
          ? 'A season-long duel. Every week, to the last man standing.'
          : `Week ${week}, one round, highest card wins.`,
    key: `duel-invite:${challengeId}`,
    data: { challengeId, duration, week },
    url: `/h2h/${challengeId}`,
  };
}

/** A duel that has finished, to both fighters. */
export function buildDuelResult(input: {
  challengeId: string;
  season: number;
  week: number;
  challengerId: string;
  opponentId: string;
  challengerName: string;
  opponentName: string;
  winnerId: string | null;
  knockout: boolean;
}): NotificationDraft[] {
  const { challengeId, season, week, winnerId, knockout } = input;

  const sides = [
    { me: input.challengerId, them: input.opponentId, theirName: input.opponentName },
    { me: input.opponentId, them: input.challengerId, theirName: input.challengerName },
  ];

  return sides.map(({ me, theirName }) => {
    const won = winnerId === me;
    const drew = winnerId === null;

    return {
      userId: me,
      type: 'h2h_result' as const,
      title: drew ? `You and ${theirName} drew` : won ? `You beat ${theirName}` : `${theirName} beat you`,
      message: drew
        ? 'Dead even. Nobody goes down.'
        : won
          ? knockout
            ? 'Knockout. They did not get up.'
            : 'The duel is yours.'
          : knockout
            ? 'Knocked out. Rematch?'
            : 'Close one. Run it back.',
      key: `duel-result:${challengeId}:${me}`,
      data: { challengeId, season, week },
      url: `/h2h/${challengeId}`,
    };
  });
}

/** A week of a season-long duel, so a long fight still has a pulse. */
export function buildDuelRound(input: {
  challengeId: string;
  week: number;
  userId: string;
  opponentName: string;
  damageDealt: number;
  damageTaken: number;
  myHp: number;
  theirHp: number;
}): NotificationDraft {
  const { challengeId, week, userId, opponentName, damageDealt, damageTaken, myHp, theirHp } = input;

  return {
    userId,
    type: 'duel_round',
    title:
      damageDealt > 0
        ? `You hit ${opponentName} for ${damageDealt}`
        : damageTaken > 0
          ? `${opponentName} hit you for ${damageTaken}`
          : `You and ${opponentName} traded nothing`,
    message: `Week ${week}: you ${myHp} HP, them ${theirHp} HP.`,
    key: `duel-round:${challengeId}:${week}`,
    data: { challengeId, week },
    url: `/h2h/${challengeId}`,
  };
}

/** Knocked out of a survivor pool. */
export function buildSurvivorElimination(input: {
  poolId: string;
  poolName: string;
  userId: string;
  week: number;
  teamAbbr: string;
}): NotificationDraft {
  const { poolId, poolName, userId, week, teamAbbr } = input;

  return {
    userId,
    type: 'survivor_eliminated',
    title: `${teamAbbr} knocked you out`,
    message: `Week ${week} ends your run in ${poolName}.`,
    key: `survivor-out:${poolId}:${userId}`,
    data: { poolId, week },
    url: '/survivor',
  };
}

/**
 * A duel going down to the wire, sent while the games are still on.
 *
 * The one notification in this app with a reason to arrive mid-afternoon rather
 * than afterwards: the point of a duel is caring about somebody else's card,
 * and the moment that is true is when it is level with yours and there are
 * games left.
 *
 * Keyed to the week, not the moment, so grading running every few minutes all
 * Sunday sends this once.
 */
export function buildDuelClose(input: {
  challengeId: string;
  week: number;
  userId: string;
  opponentName: string;
  mine: number;
  theirs: number;
}): NotificationDraft {
  const { challengeId, week, userId, opponentName, mine, theirs } = input;
  const gap = Math.abs(Math.round(mine) - Math.round(theirs));

  return {
    userId,
    type: 'duel_close',
    title: gap === 0 ? `Dead level with ${opponentName}` : `${gap} points in it`,
    message:
      mine >= theirs
        ? `You lead ${opponentName} ${Math.round(mine)}–${Math.round(theirs)}, and it is not over.`
        : `${opponentName} leads you ${Math.round(theirs)}–${Math.round(mine)}. Still games to play.`,
    key: `duel-close:${challengeId}:${week}`,
    data: { challengeId, week },
    url: `/h2h/${challengeId}`,
  };
}
