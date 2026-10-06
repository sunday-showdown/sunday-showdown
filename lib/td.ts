// TD Scorer.
//
// Pick players to score a touchdown. The price comes from lib/td-model.ts —
// scoring rate shrunk toward the position, converted to a probability properly,
// adjusted for the opponent and for how involved the player actually is — and
// then run through the same payout rule as every other pick: a $10 stake paying
// the decimal odds.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchProduction, fetchRosters, type RosterPlayer, type PlayerProduction } from './espn/players';
import { loadTeamForm } from './espn/backfill';
import { priceTd, bandFor, opponentFactor } from './td-model';
import { pointsForOdds } from './odds';
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

  const [production, rosterResult, teamForm] = await Promise.all([
    fetchProduction(season).catch((error) => {
      report.warnings.push(`leaders: ${error instanceof Error ? error.message : 'failed'}`);
      return new Map<string, PlayerProduction>();
    }),
    fetchRosters(teams),
    loadTeamForm(db, season),
  ]);
  report.warnings.push(...rosterResult.warnings);

  const players = rosterResult.players;
  if (players.length === 0) {
    report.warnings.push('no rosters fetched; nothing written');
    return report;
  }

  
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

  // Games played comes from the team's completed games rather than from the
  // week number. The old version credited everybody with (week - 1), so a
  // player who had missed a month carried the same denominator as one who had
  // started every week — and an injured star kept an elite price while sitting
  // on the bench. It still cannot see an individual absence; the usage signal
  // in lib/td-model.ts is what stands in for that.
  const gamesFor = (teamAbbr: string) =>
    teamForm.form.get(teamAbbr)?.gamesPlayed ?? Math.max(0, week - 1);

  const { error: statsError } = await db.from('player_season_stats').upsert(
    players
      .filter((p) => idByEspn.has(p.espnId))
      .map((p) => {
        const stats = production.get(p.espnId);
        return {
          player_id: idByEspn.get(p.espnId)!,
          season,
          games_played: gamesFor(p.teamAbbr),
          total_touchdowns: stats?.scoringTouchdowns ?? 0,
          rushing_attempts: stats?.touches ?? 0,
        };
      }),
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

  // Who each team plays decides the opponent adjustment.
  const opponentOf = new Map<string, string>();
  for (const game of games) {
    opponentOf.set(game.home_abbr as string, game.away_abbr as string);
    opponentOf.set(game.away_abbr as string, game.home_abbr as string);
  }

  report.valuesWritten = await priceWeek(db, season, week, players, {
    production,
    gamesFor,
    opponentOf,
    teamForm,
    report,
    idByEspn,
  });
  return report;
}

/** Write a price per league for every candidate, leaving frozen rows alone. */
interface PricingContext {
  production: ReadonlyMap<string, PlayerProduction>;
  gamesFor: (teamAbbr: string) => number;
  opponentOf: ReadonlyMap<string, string>;
  teamForm: Awaited<ReturnType<typeof loadTeamForm>>;
  report: TdSyncReport;
  idByEspn: ReadonlyMap<string, string>;
}

async function priceWeek(
  db: SupabaseClient,
  season: number,
  week: number,
  players: readonly RosterPlayer[],
  context: PricingContext,
): Promise<number> {
  const { production, gamesFor, opponentOf, teamForm, report, idByEspn } = context;
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

      const stats = production.get(player.espnId);
      const touchdowns = stats?.scoringTouchdowns ?? 0;
      const gamesPlayed = gamesFor(player.teamAbbr);

      const opponent = opponentOf.get(player.teamAbbr);
      const defence = opponent ? teamForm.form.get(opponent) : undefined;

      const price = priceTd({
        position: player.position,
        touchdowns,
        gamesPlayed,
        touches: stats?.touches ?? null,
        opponentFactor: opponentFactor(
          defence?.pointsAllowedPerGame ?? null,
          teamForm.leagueAveragePointsAllowed,
        ),
      });

      rows.push({
        league_id: league.id,
        player_id: playerId,
        season,
        week,
        american_odds: price.americanOdds,
        td_point_value: pointsForOdds(price.americanOdds),
        tier: bandFor(price.probability),
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

/**
 * Roll graded TD picks up into weekly_results.td_points.
 *
 * Deliberately kept out of total_points. A long shot pays what the odds pay,
 * which can be five times a pick'em win, so letting the two share one column
 * meant one lucky touchdown outweighed a whole card. TD Scorer has its own
 * board instead, and the season table stays a pick'em table.
 *
 * Recomputed from td_picks rather than incremented, for the same reason the
 * rest of grading is: a re-run after a correction has to produce the same
 * number, not a bigger one.
 */
export async function rollUpTdPoints(
  db: SupabaseClient,
  season: number,
  week: number,
): Promise<{ rowsWritten: number; warnings: string[] }> {
  const warnings: string[] = [];

  const { data: picks, error } = await db
    .from('td_picks')
    .select('league_id, user_id, points, result')
    .eq('season', season)
    .eq('week', week)
    .neq('result', 'pending');

  if (error) {
    warnings.push(`td roll-up: ${error.message}`);
    return { rowsWritten: 0, warnings };
  }
  if (!picks || picks.length === 0) return { rowsWritten: 0, warnings };

  const totals = new Map<string, { league: string; user: string; points: number }>();
  for (const pick of picks) {
    const league = pick.league_id as string;
    const user = pick.user_id as string;
    const key = `${league}:${user}`;
    const entry = totals.get(key) ?? { league, user, points: 0 };
    entry.points += Number(pick.points) || 0;
    totals.set(key, entry);
  }

  const rows = [...totals.values()].map((entry) => ({
    league_id: entry.league,
    user_id: entry.user,
    season,
    week,
    td_points: Math.round(entry.points * 100) / 100,
  }));

  // Upsert rather than update: somebody who played TD Scorer and skipped the
  // pick'em card has no weekly_results row for gradeWeek to have created.
  const { error: writeError } = await db
    .from('weekly_results')
    .upsert(rows, { onConflict: 'league_id,user_id,season,week' });

  if (writeError) {
    warnings.push(`td roll-up write: ${writeError.message}`);
    return { rowsWritten: 0, warnings };
  }

  return { rowsWritten: rows.length, warnings };
}
