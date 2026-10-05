// Scheduled ESPN sync.
//
// Runs on Vercel Cron, not on page load. The previous build fired its sync
// from the Home screen, so every visitor during a game triggered a provider
// call and a write storm; this runs on a fixed schedule regardless of traffic.

import { createAdminClient, isAuthorizedCron } from '@/lib/supabase/admin';
import { fetchScoreboard, EspnError } from '@/lib/espn/client';
import { syncWeek } from '@/lib/espn/sync';
import { syncTeams } from '@/lib/espn/teams';
import { syncTdWeek } from '@/lib/td';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    // Teams first: nfl_games has FKs to nfl_teams on both sides, so a game
    // sync against an empty team table fails every insert.
    const teams = await syncTeams(db);

    const scoreboard = await fetchScoreboard({
      week: weekParam ? Number(weekParam) : undefined,
      season: seasonParam ? Number(seasonParam) : undefined,
    });

    const report = await syncWeek(db, scoreboard);
    report.warnings.push(...teams.warnings);

    // TD candidates and prices follow the slate they are built from. Allowed to
    // fail on its own: a roster hiccup must not cost us the scores and odds
    // that were just written successfully.
    const td = await syncTdWeek(db, scoreboard.season, scoreboard.week).catch((tdError) => {
      report.warnings.push(
        `td sync: ${tdError instanceof Error ? tdError.message : 'failed'}`,
      );
      return null;
    });
    if (td) report.warnings.push(...td.warnings);

    const completedAt = new Date();
    await db.from('sync_logs').insert({
      sync_type: 'espn_scoreboard',
      provider_name: 'ESPN',
      status: report.warnings.length > 0 ? 'partial' : 'success',
      season: report.season,
      week: report.week,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
      games_processed: report.gamesInserted + report.gamesUpdated,
      odds_processed: report.oddsInserted,
      warnings: report.warnings,
    });

    return Response.json({ ok: true, ...report, td });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const completedAt = new Date();

    // Logged rather than swallowed: a sync that silently fails leaves the slate
    // stale and no trail explaining why.
    await db.from('sync_logs').insert({
      sync_type: 'espn_scoreboard',
      provider_name: 'ESPN',
      status: 'failed',
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
      errors: [{ message, kind: error instanceof EspnError ? 'provider' : 'internal' }],
    });

    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
