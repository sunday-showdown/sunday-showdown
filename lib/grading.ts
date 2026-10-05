// Grading orchestration.
//
// Idempotent by design: re-running a week must produce the same numbers. Career
// stats are therefore RECOMPUTED from the picks table rather than incremented —
// the previous build incremented, so a second grading run inflated every
// player's career record permanently.
//
// Reads are batched. The previous build issued a query per user per week, which
// is the N+1 pattern that made grading slow enough to time out.

import type { SupabaseClient } from '@supabase/supabase-js';
import { gradePick, summarizeWeek, rankWeek } from './scoring';
import type { PickemMarket, PickResult } from './types';

export interface GradingReport {
  season: number;
  week: number;
  picksGraded: number;
  picksAlreadyGraded: number;
  picksStillPending: number;
  resultsWritten: number;
  profilesUpdated: number;
  warnings: string[];
}

interface PickRow {
  id: string;
  user_id: string;
  league_id: string;
  challenge_id: string;
  game_id: string;
  market_type: PickemMarket;
  selection: string;
  contest_line: number | null;
  contest_odds: number | null;
  result: PickResult;
  points: number;
}

interface GameRow {
  id: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
}

/**
 * Grade every settled pick for one week, then rebuild standings and career
 * stats for the players involved.
 */
export async function gradeWeek(
  db: SupabaseClient,
  season: number,
  week: number,
): Promise<GradingReport> {
  const report: GradingReport = {
    season,
    week,
    picksGraded: 0,
    picksAlreadyGraded: 0,
    picksStillPending: 0,
    resultsWritten: 0,
    profilesUpdated: 0,
    warnings: [],
  };

  const { data: picks, error: picksError } = await db
    .from('picks')
    .select(
      'id, user_id, league_id, challenge_id, game_id, market_type, selection, contest_line, contest_odds, result, points',
    )
    .eq('season', season)
    .eq('week', week)
    .returns<PickRow[]>();

  if (picksError) throw new Error(`failed to read picks: ${picksError.message}`);
  if (!picks || picks.length === 0) return report;

  const gameIds = [...new Set(picks.map((p) => p.game_id))];
  const { data: games, error: gamesError } = await db
    .from('nfl_games')
    .select('id, status, home_score, away_score')
    .in('id', gameIds)
    .returns<GameRow[]>();

  if (gamesError) throw new Error(`failed to read games: ${gamesError.message}`);

  const gameById = new Map((games ?? []).map((g) => [g.id, g]));

  const updates: { id: string; result: PickResult; points: number; graded_at: string }[] = [];
  const gradedAt = new Date().toISOString();

  for (const pick of picks) {
    const game = gameById.get(pick.game_id);
    if (!game) {
      report.warnings.push(`pick ${pick.id}: game ${pick.game_id} missing`);
      continue;
    }

    const grade = gradePick(
      {
        marketType: pick.market_type,
        selection: pick.selection,
        contestLine: pick.contest_line === null ? null : Number(pick.contest_line),
        contestOdds: pick.contest_odds === null ? null : Number(pick.contest_odds),
      },
      // Mapped explicitly: the database row is snake_case and GradeableGame is
      // camelCase. Passing the row straight through left the scores undefined,
      // which graded every pick as a push.
      {
        status: game.status,
        homeScore: game.home_score === null ? null : Number(game.home_score),
        awayScore: game.away_score === null ? null : Number(game.away_score),
      },
    );

    if (grade.result === 'pending') {
      report.picksStillPending += 1;
      continue;
    }

    // Already correct: skip the write rather than churning updated_at and
    // re-firing realtime notifications on every run.
    if (pick.result === grade.result && Number(pick.points) === grade.points) {
      report.picksAlreadyGraded += 1;
      continue;
    }

    updates.push({ id: pick.id, result: grade.result, points: grade.points, graded_at: gradedAt });
  }

  for (const update of updates) {
    const { error } = await db
      .from('picks')
      .update({ result: update.result, points: update.points, graded_at: update.graded_at })
      .eq('id', update.id);

    if (error) {
      report.warnings.push(`pick ${update.id}: ${error.message}`);
      continue;
    }
    report.picksGraded += 1;
  }

  // Re-read so standings are built from what is actually stored, not from what
  // this run believed it wrote.
  const { data: settled, error: settledError } = await db
    .from('picks')
    .select('user_id, league_id, market_type, result, points')
    .eq('season', season)
    .eq('week', week)
    .returns<
      { user_id: string; league_id: string; market_type: PickemMarket; result: PickResult; points: number }[]
    >();

  if (settledError) throw new Error(`failed to re-read picks: ${settledError.message}`);

  report.resultsWritten = await writeWeeklyResults(db, season, week, settled ?? [], report);
  report.profilesUpdated = await rebuildCareerStats(
    db,
    [...new Set(picks.map((p) => p.user_id))],
    report,
  );

  return report;
}

async function writeWeeklyResults(
  db: SupabaseClient,
  season: number,
  week: number,
  picks: readonly {
    user_id: string;
    league_id: string;
    market_type: PickemMarket;
    result: PickResult;
    points: number;
  }[],
  report: GradingReport,
): Promise<number> {
  // league -> user -> picks
  const byLeague = new Map<string, Map<string, typeof picks[number][]>>();
  for (const pick of picks) {
    const league = byLeague.get(pick.league_id) ?? new Map();
    const user = league.get(pick.user_id) ?? [];
    user.push(pick);
    league.set(pick.user_id, user);
    byLeague.set(pick.league_id, league);
  }

  const rows: Record<string, unknown>[] = [];

  for (const [leagueId, byUser] of byLeague) {
    const totals = new Map<string, ReturnType<typeof summarizeWeek>>();
    for (const [userId, userPicks] of byUser) {
      totals.set(
        userId,
        summarizeWeek(
          userPicks.map((p) => ({
            marketType: p.market_type,
            result: p.result,
            points: Number(p.points),
          })),
        ),
      );
    }

    const standings = rankWeek(
      [...totals.entries()].map(([userId, t]) => ({
        userId,
        totalPoints: t.pickemPoints,
        wins: t.wins,
      })),
    );

    for (const standing of standings) {
      const t = totals.get(standing.userId)!;
      rows.push({
        league_id: leagueId,
        user_id: standing.userId,
        season,
        week,
        pickem_points: t.pickemPoints,
        td_points: 0,
        total_points: t.pickemPoints,
        correct_ml: t.correctMl,
        correct_spread: t.correctSpread,
        correct_totals: t.correctTotals,
        rank: standing.rank,
        is_winner: standing.isWinner,
      });
    }
  }

  if (rows.length === 0) return 0;

  const { error } = await db
    .from('weekly_results')
    .upsert(rows, { onConflict: 'league_id,user_id,season,week' });

  if (error) {
    report.warnings.push(`weekly results: ${error.message}`);
    return 0;
  }
  return rows.length;
}

/**
 * Rebuild career totals from every graded pick a player has.
 *
 * Deliberately a full recomputation. Incrementing is faster but not idempotent,
 * and a grading re-run after a score correction would then permanently
 * overstate a player's record.
 */
async function rebuildCareerStats(
  db: SupabaseClient,
  userIds: readonly string[],
  report: GradingReport,
): Promise<number> {
  if (userIds.length === 0) return 0;

  const { data: allPicks, error } = await db
    .from('picks')
    .select('user_id, market_type, result')
    .in('user_id', userIds)
    .neq('result', 'pending')
    .returns<{ user_id: string; market_type: PickemMarket; result: PickResult }[]>();

  if (error) {
    report.warnings.push(`career stats read: ${error.message}`);
    return 0;
  }

  const blank = () => ({
    career_pickem_wins: 0,
    career_pickem_losses: 0,
    career_pickem_pushes: 0,
    career_ml_wins: 0,
    career_ml_losses: 0,
    career_spread_wins: 0,
    career_spread_losses: 0,
    career_total_wins: 0,
    career_total_losses: 0,
  });

  const stats = new Map<string, ReturnType<typeof blank>>();
  for (const userId of userIds) stats.set(userId, blank());

  for (const pick of allPicks ?? []) {
    const s = stats.get(pick.user_id);
    if (!s) continue;

    if (pick.result === 'win') {
      s.career_pickem_wins += 1;
      if (pick.market_type === 'moneyline') s.career_ml_wins += 1;
      else if (pick.market_type === 'spread') s.career_spread_wins += 1;
      else if (pick.market_type === 'total') s.career_total_wins += 1;
    } else if (pick.result === 'loss') {
      s.career_pickem_losses += 1;
      if (pick.market_type === 'moneyline') s.career_ml_losses += 1;
      else if (pick.market_type === 'spread') s.career_spread_losses += 1;
      else if (pick.market_type === 'total') s.career_total_losses += 1;
    } else if (pick.result === 'push') {
      s.career_pickem_pushes += 1;
    }
  }

  let updated = 0;
  for (const [userId, s] of stats) {
    const { error: updateError } = await db.from('profiles').update(s).eq('user_id', userId);
    if (updateError) {
      report.warnings.push(`profile ${userId}: ${updateError.message}`);
      continue;
    }
    updated += 1;
  }
  return updated;
}
