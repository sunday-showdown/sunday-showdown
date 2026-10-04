// Scheduled grading.
//
// Runs on a timer, not on page load. The previous build invoked grading as a
// fire-and-forget call from the Home screen, so grading raced with itself
// whenever two players opened the app at once.

import { createAdminClient, isAuthorizedCron } from '@/lib/supabase/admin';
import { fetchCurrentWeek } from '@/lib/espn/client';
import { gradeWeek } from '@/lib/grading';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const weekParam = url.searchParams.get('week');
  const seasonParam = url.searchParams.get('season');

  const db = createAdminClient();
  const startedAt = new Date();

  try {
    const target =
      weekParam && seasonParam
        ? { season: Number(seasonParam), week: Number(weekParam) }
        : await fetchCurrentWeek();

    const report = await gradeWeek(db, target.season, target.week);

    const completedAt = new Date();
    await db.from('sync_logs').insert({
      sync_type: 'grade_pickem',
      status: report.warnings.length > 0 ? 'partial' : 'success',
      season: report.season,
      week: report.week,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
      warnings: report.warnings,
    });

    return Response.json({ ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    await db.from('sync_logs').insert({
      sync_type: 'grade_pickem',
      status: 'failed',
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      errors: [{ message }],
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
