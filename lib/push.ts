// Web push.
//
// The in-app bell only works once someone opens the app, which is exactly the
// problem with a lock reminder. This delivers to the phone.
//
// iOS supports web push only for a PWA added to the home screen, and only from
// iOS 16.4. Safari in a tab will never prompt, so the UI has to say that rather
// than leaving an inert button.

import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let configured = false;

/** Returns false when keys are absent, so callers can skip rather than throw. */
function configure(): boolean {
  if (configured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:noreply@sundayshowdown.app';
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushReport {
  sent: number;
  expired: number;
  failed: number;
  skipped: boolean;
  warnings: string[];
}

/**
 * Push to a set of users.
 *
 * A 404 or 410 means the browser threw the subscription away — the device was
 * wiped, the app uninstalled, permission revoked. Those are cleared rather than
 * retried forever, which is the difference between a push queue that stays
 * healthy and one that grows garbage all season.
 */
export async function pushToUsers(
  db: SupabaseClient,
  userIds: readonly string[],
  payload: PushPayload,
): Promise<PushReport> {
  const report: PushReport = { sent: 0, expired: 0, failed: 0, skipped: false, warnings: [] };

  if (!configure()) {
    report.skipped = true;
    return report;
  }
  if (userIds.length === 0) return report;

  const { data: rows, error } = await db
    .from('notification_preferences')
    .select('user_id, push_subscription')
    .in('user_id', [...new Set(userIds)])
    .not('push_subscription', 'is', null);

  if (error) {
    report.warnings.push(`push subscriptions: ${error.message}`);
    return report;
  }
  if (!rows || rows.length === 0) return report;

  const body = JSON.stringify(payload);
  const expired: string[] = [];

  for (const row of rows) {
    const subscription = row.push_subscription as webpush.PushSubscription | null;
    if (!subscription?.endpoint) continue;

    try {
      await webpush.sendNotification(subscription, body, { TTL: 3600 });
      report.sent += 1;
    } catch (sendError) {
      const status = (sendError as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        expired.push(row.user_id as string);
        report.expired += 1;
      } else {
        report.failed += 1;
        report.warnings.push(`push ${row.user_id}: ${status ?? 'failed'}`);
      }
    }
  }

  if (expired.length > 0) {
    const { error: clearError } = await db
      .from('notification_preferences')
      .update({ push_subscription: null })
      .in('user_id', expired);

    if (clearError) report.warnings.push(`clearing dead subscriptions: ${clearError.message}`);
  }

  return report;
}
