// One way to notify somebody.
//
// Before this, in-app notifications and web push were two unrelated code paths
// and only two events ever used the second one — a lock reminder and a chat
// message. So a week got graded, a duel was lost and a survivor run ended with
// nothing on the phone at all; the app had to be opened to find out, which is
// the opposite of what a notification is for.
//
// This is the single door. Write the notifications, then push exactly the ones
// that were new. "New" comes from deliver(), which reports which rows the unique
// key actually let through — so a cron that runs every five minutes all Sunday
// buzzes once per event rather than once per pass. That property is the whole
// reason push goes through here and not straight to lib/push.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { deliver, type DeliveryReport, type NotificationDraft } from './notifications';
import { pushToUsers } from './push';

export interface NotifyReport extends DeliveryReport {
  pushed: number;
}

/**
 * Deliver, then push.
 *
 * Drafts are pushed individually rather than batched, because the title, body
 * and destination are per person: "you beat Dan" and "Dan beat you" are the
 * same event and must not arrive as one shared string.
 *
 * Push failure is never grading failure. Warnings are collected and returned;
 * a dead subscription or missing VAPID keys must not roll back a settled week.
 */
export async function notify(
  db: SupabaseClient,
  drafts: readonly NotificationDraft[],
): Promise<NotifyReport> {
  const report = await deliver(db, drafts);
  const pushReport: NotifyReport = { ...report, pushed: 0 };
  if (report.createdFor.length === 0) return pushReport;

  // A user may legitimately appear twice with different messages, so this
  // counts down rather than deduplicating: two distinct events are two pushes.
  const remaining = new Map<string, number>();
  for (const userId of report.createdFor) {
    remaining.set(userId, (remaining.get(userId) ?? 0) + 1);
  }

  for (const draft of drafts) {
    const left = remaining.get(draft.userId) ?? 0;
    if (left === 0) continue;
    remaining.set(draft.userId, left - 1);

    const sent = await pushToUsers(db, [draft.userId], {
      title: draft.title,
      body: draft.message,
      url: draft.url ?? '/home',
      // Keyed to the notification, so a replacement for the same event collapses
      // on the lock screen instead of stacking.
      tag: draft.key,
    });

    pushReport.pushed += sent.sent;
    pushReport.warnings.push(...sent.warnings);
  }

  return pushReport;
}
