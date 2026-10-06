// Filling in the weeks already played.
//
// The sync only ever fetched the current week, so nfl_games held one or two
// weeks and nothing else. That was fine while the only question was "what is on
// this Sunday", but two things now need the season behind us: how many games a
// player's team has actually played, which is the denominator for every
// touchdown price, and how many points each defence has conceded, which is the
// opponent adjustment.
//
// Only weeks with no rows at all are fetched, so this costs seventeen requests
// once and nothing on every run afterwards. The regular sync keeps the current
// week fresh; this is only ever reaching backwards.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchScoreboard } from './client';
import { syncWeek } from './sync';

export interface BackfillReport {
  weeksFetched: number[];
  gamesWritten: number;
  warnings: string[];
}

/**
 * Fetch any week before `upToWeek` that is missing from nfl_games.
 *
 * Sequential rather than parallel: this is a free, undocumented endpoint and
 * seventeen simultaneous requests is the kind of thing that gets an IP rate
 * limited. It runs once, so the extra seconds cost nothing.
 */
export async function backfillSeason(
  db: SupabaseClient,
  season: number,
  upToWeek: number,
): Promise<BackfillReport> {
  const report: BackfillReport = { weeksFetched: [], gamesWritten: 0, warnings: [] };
  if (!Number.isInteger(upToWeek) || upToWeek < 2) return report;

  const { data: existing, error } = await db
    .from('nfl_games')
    .select('week')
    .eq('season', season);

  if (error) {
    report.warnings.push(`backfill: could not read existing weeks: ${error.message}`);
    return report;
  }

  const have = new Set((existing ?? []).map((row) => row.week as number));
  const missing = [];
  for (let week = 1; week < upToWeek; week += 1) {
    if (!have.has(week)) missing.push(week);
  }
  if (missing.length === 0) return report;

  for (const week of missing) {
    try {
      const scoreboard = await fetchScoreboard({ season, week });
      const result = await syncWeek(db, scoreboard);
      report.gamesWritten += result.gamesInserted + result.gamesUpdated;
      report.weeksFetched.push(week);
      report.warnings.push(...result.warnings);
    } catch (weekError) {
      // One unavailable week must not stop the rest; the next run retries it.
      report.warnings.push(
        `backfill week ${week}: ${weekError instanceof Error ? weekError.message : 'failed'}`,
      );
    }
  }

  return report;
}

export interface TeamForm {
  /** Completed games, which is the denominator for a player's scoring rate. */
  gamesPlayed: number;
  /** Points conceded per completed game. Null until they have played one. */
  pointsAllowedPerGame: number | null;
}

/**
 * How each team has fared so far, from the games already stored.
 *
 * Points allowed stands in for touchdowns allowed, which would be better and
 * needs a play-by-play feed. It correlates closely enough for an adjustment
 * that lib/td-model.ts clamps to a narrow band either way.
 */
export async function loadTeamForm(
  db: SupabaseClient,
  season: number,
): Promise<{ form: Map<string, TeamForm>; leagueAveragePointsAllowed: number | null }> {
  const { data: games } = await db
    .from('nfl_games')
    .select('home_abbr, away_abbr, home_score, away_score, status')
    .eq('season', season)
    .eq('status', 'final');

  const played = new Map<string, number>();
  const conceded = new Map<string, number>();

  for (const game of (games ?? []) as Record<string, unknown>[]) {
    const home = game.home_abbr as string;
    const away = game.away_abbr as string;
    const homeScore = Number(game.home_score);
    const awayScore = Number(game.away_score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

    played.set(home, (played.get(home) ?? 0) + 1);
    played.set(away, (played.get(away) ?? 0) + 1);
    conceded.set(home, (conceded.get(home) ?? 0) + awayScore);
    conceded.set(away, (conceded.get(away) ?? 0) + homeScore);
  }

  const form = new Map<string, TeamForm>();
  let totalAllowed = 0;
  let totalGames = 0;

  for (const [team, gamesPlayed] of played) {
    const points = conceded.get(team) ?? 0;
    form.set(team, {
      gamesPlayed,
      pointsAllowedPerGame: gamesPlayed > 0 ? points / gamesPlayed : null,
    });
    totalAllowed += points;
    totalGames += gamesPlayed;
  }

  return {
    form,
    leagueAveragePointsAllowed: totalGames > 0 ? totalAllowed / totalGames : null,
  };
}
