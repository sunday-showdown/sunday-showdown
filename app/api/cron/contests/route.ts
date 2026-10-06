// Contest lifecycle cron: open the current and next week, freeze what has locked.
//
// Opening next week as well as this one means a slate is always pickable ahead
// of time rather than appearing only once the week begins.

import { createAdminClient, isAuthorizedCron } from '@/lib/supabase/admin';
import { fetchCurrentWeek } from '@/lib/espn/client';
import { openWeek, freezeLockedContests, advanceFinishedWeeks } from '@/lib/contests';
import { sendLockReminders } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LAST_REGULAR_WEEK = 18;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = createAdminClient();
  const startedAt = new Date();

  try {
    const { season, week } = await fetchCurrentWeek();

    const opened = [await openWeek(db, season, week, { advanceLeagueWeek: true })];
    if (week < LAST_REGULAR_WEEK) {
      opened.push(await openWeek(db, season, week + 1));
    }

    // After opening, so next week's contest exists to advance onto. ESPN keeps
    // calling a finished week "current" until the Tuesday, which left the app
    // sitting on a completed, empty card for most of a day.
    const advanced = await advanceFinishedWeeks(db, season);

    const frozen = await freezeLockedContests(db);
    const reminders = await sendLockReminders(db);

    const warnings = [
      ...opened.flatMap((o) => o.warnings),
      ...advanced.warnings,
      ...frozen.warnings,
      ...reminders.warnings,
    ];
    await db.from('sync_logs').insert({
      sync_type: 'contest_lifecycle',
      status: warnings.length > 0 ? 'partial' : 'success',
      season,
      week,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      warnings,
    });

    return Response.json({
      ok: true,
      season,
      week,
      challengesCreated: opened.reduce((sum, o) => sum + o.challengesCreated, 0),
      leaguesAdvanced: advanced.leaguesAdvanced,
      advancedTo: advanced.to,
      challengesFrozen: frozen.challengesFrozen,
      linesFrozen: frozen.linesFrozen,
      remindersSent: reminders.notified,
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    await db.from('sync_logs').insert({
      sync_type: 'contest_lifecycle',
      status: 'failed',
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      errors: [{ message }],
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
