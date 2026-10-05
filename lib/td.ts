// TD Scorer.
//
// Pick players to score a touchdown. A player's price comes from how often he
// actually scores, shrunk toward the league average, then run through the same
// payout rule as every other pick: a $10 stake paying the decimal odds.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchTouchdownLeaders, fetchRosters, type RosterPlayer } from './espn/players';
import { tdScoringProbability, tdBandFor } from './types';
import { probabilityToAmerican, pointsForOdds } from './odds';
import { fetchTouchdownScorers, normalizeName as normalizeScorer } from './espn/scoring-plays';

export interface TdSyncReport {
  season: number;
  week: number;
  playersWritten: number;
  candidatesWritten: number;
  valuesWritten: number;
  warnings: string[];
}

/**
 * Refresh players, their touchdown counts, and this week's candidate list.
 *
 * Only teams on this week's slate are fetched: a player on a bye cannot score,
 * and it keeps the job well inside its time budget.
 */
export async function syncTdWeek(
  db: SupabaseClient,
  season: number,
  week: number,
): Promise<TdSyncReport> {
  const report: TdSyncReport = {
    season,
    week,
    playersWritten: 0,
    candidatesWritten: 0,
    valuesWritten: 0,
    warnings: [],
  };

  const { data: games, error: gamesError } = await db
    .from('nfl_games')
    .select('id, home_abbr, away_abbr')
    .eq('season', season)
    .eq('week', week);

  if (gamesError) throw new Error(`failed to read slate: ${gamesError.message}`);
  if (!games || games.length === 0) {
    report.warnings.push('no games on the slate');
    return report;
  }

  const teams = [...new Set(games.flatMap((g) => [g.home_abbr as string, g.away_abbr as string]))];

  const [leaders, rosterResult] = await Promise.all([
    fetchTouchdownLeaders(season).catch((error) => {
      report.warnings.push(`leaders: ${error instanceof Error ? error.message : 'failed'}`);
      return [];
    }),
    fetchRosters(teams),
  ]);
  report.warnings.push(...rosterResult.warnings);

  const players = rosterResult.players;
  if (players.length === 0) {
    report.warnings.push('no rosters fetched; nothing written');
    return report;
  }

  const touchdownsBy = new Map(leaders.map((l) => [l.espnId, l.touchdowns]));

  const { error: playerError } = await db.from('nfl_players').upsert(
    players.map((p) => ({
      espn_id: p.espnId,
      name: p.name,
      normalized_name: normalizeName(p.name),
      team_abbr: p.teamAbbr,
      position: p.position,
      headshot_url: p.headshotUrl,
      jersey_number: p.jersey,
      season,
      status: 'active',
      last_synced: new Date().toISOString(),
    })),
    { onConflict: 'espn_id' },
  );

  if (playerError) throw new Error(`failed to upsert players: ${playerError.message}`);
  report.playersWritten = players.length;

  const { data: stored, error: storedError } = await db
    .from('nfl_players')
    .select('id, espn_id, team_abbr')
    .in('espn_id', players.map((p) => p.espnId));

  if (storedError) throw new Error(`failed to read players back: ${storedError.message}`);
  const idByEspn = new Map((stored ?? []).map((p) => [p.espn_id as string, p.id as string]));

  // Games played is not in the leaders payload, so the week number stands in:
  // by week 5 a healthy starter has played about four games. Good enough to
  // separate a reliable scorer from a long shot, which is all the price needs.
  const gamesPlayed = Math.max(1, week - 1);

  const { error: statsError } = await db.from('player_season_stats').upsert(
    players
      .filter((p) => idByEspn.has(p.espnId))
      .map((p) => ({
        player_id: idByEspn.get(p.espnId)!,
        season,
        games_played: gamesPlayed,
        total_touchdowns: touchdownsBy.get(p.espnId) ?? 0,
      })),
    { onConflict: 'player_id,season' },
  );

  if (statsError) report.warnings.push(`stats: ${statsError.message}`);

  // Candidates: every offensive player on a team playing this week.
  const gameForTeam = new Map<string, { id: string; opponent: string }>();
  for (const game of games) {
    gameForTeam.set(game.home_abbr as string, { id: game.id as string, opponent: game.away_abbr as string });
    gameForTeam.set(game.away_abbr as string, { id: game.id as string, opponent: game.home_abbr as string });
  }

  const candidates = players
    .filter((p) => idByEspn.has(p.espnId) && gameForTeam.has(p.teamAbbr))
    .map((p) => ({
      game_id: gameForTeam.get(p.teamAbbr)!.id,
      player_id: idByEspn.get(p.espnId)!,
      season,
      week,
      team_abbr: p.teamAbbr,
      opponent_abbr: gameForTeam.get(p.teamAbbr)!.opponent,
      position: p.position,
      is_active: true,
    }));

  const { error: candidateError } = await db
    .from('td_players')
    .upsert(candidates, { onConflict: 'game_id,player_id' });

  if (candidateError) report.warnings.push(`candidates: ${candidateError.message}`);
  else report.candidatesWritten = candidates.length;

  report.valuesWritten = await priceWeek(db, season, week, players, touchdownsBy, idByEspn, gamesPlayed, report);
  return report;
}

/** Write a price per league for every candidate, leaving frozen rows alone. */
async function priceWeek(
  db: SupabaseClient,
  season: number,
  week: number,
  players: readonly RosterPlayer[],
  touchdownsBy: ReadonlyMap<string, number>,
  idByEspn: ReadonlyMap<string, string>,
  gamesPlayed: number,
  report: TdSyncReport,
): Promise<number> {
  const { data: leagues, error } = await db.from('leagues').select('id').eq('season', season);
  if (error) {
    report.warnings.push(`leagues: ${error.message}`);
    return 0;
  }
  if (!leagues || leagues.length === 0) return 0;

  const rows: Record<string, unknown>[] = [];
  for (const league of leagues) {
    for (const player of players) {
      const playerId = idByEspn.get(player.espnId);
      if (!playerId) continue;

      const touchdowns = touchdownsBy.get(player.espnId) ?? 0;
      const probability = tdScoringProbability(touchdowns, gamesPlayed);
      const american = probabilityToAmerican(probability) ?? 400;

      rows.push({
        league_id: league.id,
        player_id: playerId,
        season,
        week,
        american_odds: american,
        td_point_value: pointsForOdds(american),
        tier: tdBandFor(touchdowns, gamesPlayed),
        source: 'auto',
        computed_total_tds: touchdowns,
        computed_games_played: gamesPlayed,
      });
    }
  }

  if (rows.length === 0) return 0;

  // Frozen values are history; a re-price must not touch them. The upsert
  // targets the unique key, and the immutability trigger rejects any attempt to
  // change a frozen row, so those are filtered out here first.
  const { data: frozen } = await db
    .from('td_values')
    .select('league_id, player_id')
    .eq('season', season)
    .eq('week', week)
    .not('frozen_at', 'is', null);

  const frozenKeys = new Set((frozen ?? []).map((f) => `${f.league_id}:${f.player_id}`));
  const writable = rows.filter((r) => !frozenKeys.has(`${r.league_id}:${r.player_id}`));
  if (writable.length === 0) return 0;

  const { error: upsertError, count } = await db
    .from('td_values')
    .upsert(writable, { onConflict: 'league_id,player_id,season,week', count: 'exact' });

  if (upsertError) {
    report.warnings.push(`values: ${upsertError.message}`);
    return 0;
  }

  return count ?? writable.length;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Grading --------------------------------------------------------------------

export interface TdGradingReport {
  season: number;
  week: number;
  picksGraded: number;
  scorers: number;
  warnings: string[];
}

/**
 * Settle TD picks for every finished game in a week.
 *
 * One summary fetch per finished game, not per pick. A player who scored twice
 * still wins once: the pick is "did he score", not "how many".
 */
export async function gradeTdWeek(
  db: SupabaseClient,
  season: number,
  week: number,
): Promise<TdGradingReport> {
  const report: TdGradingReport = { season, week, picksGraded: 0, scorers: 0, warnings: [] };

  const { data: picks, error } = await db
    .from('td_picks')
    .select('id, game_id, player_id, td_point_value')
    .eq('season', season)
    .eq('week', week)
    .eq('result', 'pending');

  if (error) throw new Error(`failed to read td picks: ${error.message}`);
  if (!picks || picks.length === 0) return report;

  const gameIds = [...new Set(picks.map((p) => p.game_id as string))];
  const { data: games } = await db
    .from('nfl_games')
    .select('id, espn_id, status')
    .in('id', gameIds)
    .eq('status', 'final');

  if (!games || games.length === 0) return report;

  const { data: players } = await db
    .from('nfl_players')
    .select('id, normalized_name')
    .in('id', [...new Set(picks.map((p) => p.player_id as string))]);

  const nameFor = new Map(
    (players ?? []).map((p) => [p.id as string, p.normalized_name as string]),
  );

  const now = new Date().toISOString();

  for (const game of games) {
    let scorers: string[];
    try {
      scorers = await fetchTouchdownScorers(game.espn_id as string);
    } catch (fetchError) {
      report.warnings.push(
        `summary ${game.espn_id}: ${fetchError instanceof Error ? fetchError.message : 'failed'}`,
      );
      continue;
    }

    const scored = new Set(scorers.map(normalizeScorer));
    report.scorers += scored.size;

    for (const pick of picks.filter((p) => p.game_id === game.id)) {
      const name = nameFor.get(pick.player_id as string);
      if (!name) {
        report.warnings.push(`td pick ${pick.id}: player name missing`);
        continue;
      }

      const hit = scored.has(normalizeScorer(name));
      const { error: updateError } = await db
        .from('td_picks')
        .update({
          result: hit ? 'win' : 'loss',
          points: hit ? Number(pick.td_point_value) : 0,
          graded_at: now,
        })
        .eq('id', pick.id);

      if (updateError) {
        report.warnings.push(`td pick ${pick.id}: ${updateError.message}`);
        continue;
      }
      report.picksGraded += 1;
    }
  }

  return report;
}
