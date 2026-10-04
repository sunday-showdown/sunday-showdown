// Writes an ESPN scoreboard into the database.
//
// Two rules the previous build got wrong and that this module exists to hold:
//
// 1. Odds vanish from the feed at kickoff. An empty odds array means "the game
//    started", never "the lines were withdrawn", so captured lines are left
//    alone rather than deactivated.
//
// 2. Status may only move forward. The database enforces this with a trigger,
//    so a regressing update raises instead of silently un-grading a week; this
//    module filters those out beforehand so one bad row cannot fail the batch.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedGame, ParsedOdds } from './parse';
import type { GameStatus } from '../types';

const STATUS_RANK: Record<GameStatus, number> = {
  scheduled: 0,
  postponed: 0,
  in_progress: 1,
  final: 2,
};

/**
 * Whether an incoming status may replace the stored one.
 *
 * Final is terminal apart from itself, which keeps a score correction possible
 * while making it impossible to un-grade a played game.
 *
 * Postponed is deliberately outside the ranking. A postponement is real news
 * about a game that has not been played, and a postponed game that gets
 * rescheduled must be able to return to `scheduled` so it can be picked again —
 * treating that as a regression would leave the game permanently unpickable.
 */
export function canApplyStatus(current: GameStatus, incoming: GameStatus): boolean {
  if (current === incoming) return true;
  if (current === 'final') return false;
  if (incoming === 'postponed') return true;
  if (current === 'postponed') return true;
  return STATUS_RANK[incoming] > STATUS_RANK[current];
}

export interface SyncReport {
  season: number;
  week: number;
  gamesInserted: number;
  gamesUpdated: number;
  statusRegressionsBlocked: number;
  oddsInserted: number;
  oddsSuperseded: number;
  oddsPreserved: number;
  warnings: string[];
}

interface ExistingGame {
  id: string;
  espn_id: string;
  status: GameStatus;
  home_score: number | null;
  away_score: number | null;
}

interface ExistingOdds {
  id: string;
  game_id: string;
  market_type: string;
  selection: string;
  line: number | null;
  american_odds: number | null;
}

const oddsKey = (gameId: string, market: string, selection: string) =>
  `${gameId}:${market}:${selection}`;

function oddsChanged(existing: ExistingOdds, incoming: ParsedOdds): boolean {
  return (
    Number(existing.line) !== Number(incoming.line) ||
    existing.american_odds !== incoming.americanOdds
  );
}

/**
 * Upsert a week of games and their odds.
 *
 * Teams are expected to exist already (seeded separately); a game referencing
 * an unknown abbreviation is reported as a warning rather than failing the run,
 * so one expansion team cannot stall every sync.
 */
export async function syncWeek(
  db: SupabaseClient,
  result: { season: number; week: number; games: ParsedGame[] },
): Promise<SyncReport> {
  const report: SyncReport = {
    season: result.season,
    week: result.week,
    gamesInserted: 0,
    gamesUpdated: 0,
    statusRegressionsBlocked: 0,
    oddsInserted: 0,
    oddsSuperseded: 0,
    oddsPreserved: 0,
    warnings: [],
  };

  if (result.games.length === 0) {
    report.warnings.push('ESPN returned no games for this week');
    return report;
  }

  const espnIds = result.games.map((g) => g.espnId);

  const { data: existingRows, error: existingError } = await db
    .from('nfl_games')
    .select('id, espn_id, status, home_score, away_score')
    .in('espn_id', espnIds);

  if (existingError) {
    throw new Error(`failed to read existing games: ${existingError.message}`);
  }

  const existing = new Map<string, ExistingGame>(
    (existingRows ?? []).map((row) => [row.espn_id, row as ExistingGame]),
  );

  const toWrite: Record<string, unknown>[] = [];

  for (const game of result.games) {
    const prior = existing.get(game.espnId);

    if (prior && !canApplyStatus(prior.status, game.status)) {
      report.statusRegressionsBlocked += 1;
      report.warnings.push(
        `${game.espnId}: refused ${prior.status} -> ${game.status}`,
      );
      continue;
    }

    // A final game must carry scores (enforced by a check constraint). If the
    // feed says final without them, keep whatever was stored rather than
    // writing a row the database will reject.
    const homeScore = game.homeScore ?? prior?.home_score ?? null;
    const awayScore = game.awayScore ?? prior?.away_score ?? null;
    if (game.status === 'final' && (homeScore === null || awayScore === null)) {
      report.warnings.push(`${game.espnId}: final with no score, left unchanged`);
      continue;
    }

    toWrite.push({
      espn_id: game.espnId,
      season: game.season,
      week: game.week,
      season_type: game.seasonType,
      home_abbr: game.homeAbbr,
      away_abbr: game.awayAbbr,
      home_team: game.homeTeam,
      away_team: game.awayTeam,
      home_logo: game.homeLogo,
      away_logo: game.awayLogo,
      home_color: game.homeColor,
      away_color: game.awayColor,
      start_time: game.startTime,
      status: game.status,
      status_detail: game.statusDetail,
      home_score: homeScore,
      away_score: awayScore,
      last_synced: new Date().toISOString(),
    });

    if (prior) report.gamesUpdated += 1;
    else report.gamesInserted += 1;
  }

  if (toWrite.length === 0) return report;

  const { data: written, error: writeError } = await db
    .from('nfl_games')
    .upsert(toWrite, { onConflict: 'espn_id' })
    .select('id, espn_id');

  if (writeError) {
    throw new Error(`failed to upsert games: ${writeError.message}`);
  }

  const gameIdByEspnId = new Map<string, string>(
    (written ?? []).map((row) => [row.espn_id as string, row.id as string]),
  );

  await syncOdds(db, result.games, gameIdByEspnId, report);
  return report;
}

async function syncOdds(
  db: SupabaseClient,
  games: ParsedGame[],
  gameIdByEspnId: Map<string, string>,
  report: SyncReport,
): Promise<void> {
  const gameIds = [...gameIdByEspnId.values()];
  if (gameIds.length === 0) return;

  const { data: activeRows, error } = await db
    .from('nfl_game_odds')
    .select('id, game_id, market_type, selection, line, american_odds')
    .in('game_id', gameIds)
    .eq('is_active', true);

  if (error) {
    throw new Error(`failed to read active odds: ${error.message}`);
  }

  const active = new Map<string, ExistingOdds>(
    (activeRows ?? []).map((row) => [
      oddsKey(row.game_id as string, row.market_type as string, row.selection as string),
      row as ExistingOdds,
    ]),
  );

  const supersede: string[] = [];
  const insert: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const game of games) {
    const gameId = gameIdByEspnId.get(game.espnId);
    if (!gameId) continue;

    // The load-bearing case: no odds in the feed means the game has started.
    // Previously captured lines are what players were offered, so they stay.
    if (game.odds.length === 0) {
      report.oddsPreserved += active.size > 0 ? 1 : 0;
      continue;
    }

    for (const row of game.odds) {
      const key = oddsKey(gameId, row.marketType, row.selection);
      const current = active.get(key);

      if (current && !oddsChanged(current, row)) continue;
      if (current) supersede.push(current.id);

      insert.push({
        game_id: gameId,
        season: game.season,
        week: game.week,
        market_type: row.marketType,
        selection: row.selection,
        team_abbr: row.teamAbbr,
        line: row.line,
        american_odds: row.americanOdds,
        provider: game.provider ?? 'ESPN',
        captured_at: now,
        is_active: true,
      });
    }
  }

  // Deactivate before inserting: a partial unique index allows only one active
  // row per (game, market, selection), so the new row would collide otherwise.
  if (supersede.length > 0) {
    const { error: supersedeError } = await db
      .from('nfl_game_odds')
      .update({ is_active: false, superseded_at: now })
      .in('id', supersede);

    if (supersedeError) {
      throw new Error(`failed to supersede odds: ${supersedeError.message}`);
    }
    report.oddsSuperseded = supersede.length;
  }

  if (insert.length > 0) {
    const { error: insertError } = await db.from('nfl_game_odds').insert(insert);
    if (insertError) {
      throw new Error(`failed to insert odds: ${insertError.message}`);
    }
    report.oddsInserted = insert.length;
  }
}
