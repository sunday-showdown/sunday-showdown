// Duels.
//
// Call someone out — a league mate or any friend — and both of you play your
// normal Pick'em card. The higher score wins the week. It costs nothing and
// changes nothing about league scoring; it exists to give two people a reason
// to care about each other's card.
//
// Two things make this more than a comparison of numbers.
//
// A duel can run for a week or for the whole season. A season duel is a series
// of rounds, one per week, stored in h2h_rounds and replayed from scratch every
// time (lib/battle.ts) rather than kept as a running total — so a week
// re-graded for a corrected score corrects the fight instead of being added to
// it twice.
//
// And a duel outside a league has to say whose card counts. Inside a league
// both players share a slate and a frozen set of lines, so the league answered
// it. Across leagues it does not, so each row records the league its own side's
// card is read from: challenger_league_id at creation, opponent_league_id when
// the challenge is accepted. Grading reads those and never guesses.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  capFor,
  playBattle,
  roundDamage,
  battleOutcome,
  isCloseFight,
  MAX_HP,
  type Duration,
  type Round,
} from './battle';
import { defaultFighter } from './fighters';
import { buildDuelClose, buildDuelResult, buildDuelRound } from './notifications';
import { notify } from './notify';

/** The last week a regular-season duel can be settled in. */
export const LAST_REGULAR_WEEK = 18;

export type H2HOutcome = 'challenger' | 'opponent' | 'tie' | 'pending';

/**
 * Settle a single round from both weekly totals.
 *
 * Null means that player has nothing graded yet, so the round is not ready.
 * A player who simply did not pick scores zero, which is a legitimate loss —
 * that is handled by the caller passing 0, not null.
 */
export function settleChallenge(
  challengerPoints: number | null,
  opponentPoints: number | null,
): H2HOutcome {
  if (challengerPoints === null || opponentPoints === null) return 'pending';
  if (challengerPoints > opponentPoints) return 'challenger';
  if (opponentPoints > challengerPoints) return 'opponent';
  return 'tie';
}

/**
 * The canonical ordering for a pair.
 *
 * h2h_records stores one row per pair with user_a_id < user_b_id, enforced by a
 * check constraint. Without a canonical order the same matchup could end up
 * with two rows disagreeing about the record.
 */
export function canonicalPair(a: string, b: string): { userA: string; userB: string; swapped: boolean } {
  return a < b ? { userA: a, userB: b, swapped: false } : { userA: b, userB: a, swapped: true };
}

/**
 * Which challenges a run of grading for one week has to look at.
 *
 * A weekly duel only matters in its own week. A season duel matters in every
 * week from the one it started in onwards, because each of those is a round it
 * has not played yet.
 */
export function isDuelDue(
  challenge: { duration: string; week: number },
  week: number,
): boolean {
  return challenge.duration === 'season' ? week >= challenge.week : challenge.week === week;
}

export interface H2HReport {
  season: number;
  week: number;
  settled: number;
  roundsPlayed: number;
  expired: number;
  knockouts: number;
  /** "Your duel is close" notifications sent while a week was still running. */
  closeCalls: number;
  warnings: string[];
}

interface ChallengeRow {
  id: string;
  challenger_id: string;
  opponent_id: string;
  league_id: string | null;
  challenger_league_id: string | null;
  opponent_league_id: string | null;
  duration: Duration;
  season: number;
  week: number;
  status: string;
}

/**
 * Play every open duel's round for a week, settling the ones that are finished.
 *
 * Also expires anything still unanswered once its week has results — an ignored
 * challenge should not sit in somebody's inbox forever.
 */
export async function gradeH2HWeek(
  db: SupabaseClient,
  season: number,
  week: number,
): Promise<H2HReport> {
  const report: H2HReport = {
    season,
    week,
    settled: 0,
    roundsPlayed: 0,
    expired: 0,
    knockouts: 0,
    closeCalls: 0,
    warnings: [],
  };

  const { data: challenges, error } = await db
    .from('h2h_challenges')
    .select(
      'id, challenger_id, opponent_id, league_id, challenger_league_id, opponent_league_id, duration, season, week, status',
    )
    .eq('season', season)
    .in('status', ['accepted', 'pending'])
    .returns<ChallengeRow[]>();

  if (error) throw new Error(`failed to read challenges: ${error.message}`);

  const due = (challenges ?? []).filter((c) => isDuelDue(c, week));
  if (due.length === 0) return report;

  const { data: results, error: resultsError } = await db
    .from('weekly_results')
    .select('league_id, user_id, total_points')
    .eq('season', season)
    .eq('week', week);

  if (resultsError) throw new Error(`failed to read results: ${resultsError.message}`);

  const pointsFor = new Map<string, number>();
  const gradedLeagues = new Set<string>();
  for (const row of results ?? []) {
    pointsFor.set(`${row.league_id}:${row.user_id}`, Number(row.total_points));
    gradedLeagues.add(row.league_id as string);
  }

  // Which leagues have finished the week, as opposed to merely started it.
  //
  // weekly_results appears as soon as the first game of the week settles, so
  // "there are results" is not "the week is over" — and a weekly duel read that
  // way would crown a winner on Sunday afternoon off two finished games. A
  // league is done when it has no pending picks left.
  const { data: pendingRows, error: pendingError } = await db
    .from('picks')
    .select('league_id')
    .eq('season', season)
    .eq('week', week)
    .eq('result', 'pending');

  if (pendingError) throw new Error(`failed to read pending picks: ${pendingError.message}`);

  const stillPlaying = new Set((pendingRows ?? []).map((row) => row.league_id as string));

  const names = await loadUsernames(
    db,
    due.flatMap((c) => [c.challenger_id, c.opponent_id]),
  );
  const now = new Date().toISOString();

  for (const challenge of due) {
    // Where each side's card is read from. Older rows predate the split, so the
    // shared league is the fallback.
    const challengerLeague = challenge.challenger_league_id ?? challenge.league_id;
    const opponentLeague = challenge.opponent_league_id ?? challenge.league_id;

    // "Graded" is per league, not global: two friends in different leagues can
    // have one week settled and the other still running.
    const bothGraded =
      challengerLeague !== null &&
      opponentLeague !== null &&
      gradedLeagues.has(challengerLeague) &&
      gradedLeagues.has(opponentLeague);

    // Both cards finished, not merely started. Until then the round is live:
    // worth recording and worth a notification if it is tight, but not worth
    // declaring.
    const weekIsOver =
      bothGraded &&
      !stillPlaying.has(challengerLeague!) &&
      !stillPlaying.has(opponentLeague!);

    if (challenge.status === 'pending') {
      // Never answered, and the week it was for is over: it is dead.
      if (weekIsOver) {
        const { error: expireError } = await db
          .from('h2h_challenges')
          .update({ status: 'expired', expired_at: now })
          .eq('id', challenge.id);
        if (expireError) report.warnings.push(`challenge ${challenge.id}: ${expireError.message}`);
        else report.expired += 1;
      }
      continue;
    }

    if (!bothGraded) continue;

    // A graded league with no row for somebody means they did not play, which
    // scores zero. That is a loss, not a reason to hold the round open.
    const challengerPoints = pointsFor.get(`${challengerLeague}:${challenge.challenger_id}`) ?? 0;
    const opponentPoints = pointsFor.get(`${opponentLeague}:${challenge.opponent_id}`) ?? 0;

    const damage = roundDamage(challengerPoints, opponentPoints, capFor(challenge.duration));

    const { error: roundError } = await db.from('h2h_rounds').upsert(
      {
        challenge_id: challenge.id,
        week,
        challenger_points: challengerPoints,
        opponent_points: opponentPoints,
        challenger_damage: damage.challenger,
        opponent_damage: damage.opponent,
        graded_at: now,
      },
      { onConflict: 'challenge_id,week' },
    );

    if (roundError) {
      report.warnings.push(`round ${challenge.id}:${week}: ${roundError.message}`);
      continue;
    }
    report.roundsPlayed += 1;

    // Replayed from every stored round, including the one just written, so the
    // fight is always a function of the rounds rather than of how many times
    // grading has run.
    const { data: roundRows, error: readError } = await db
      .from('h2h_rounds')
      .select('week, challenger_points, opponent_points, challenger_damage, opponent_damage')
      .eq('challenge_id', challenge.id);

    if (readError) {
      report.warnings.push(`rounds ${challenge.id}: ${readError.message}`);
      continue;
    }

    const rounds: Round[] = (roundRows ?? []).map((row) => ({
      week: row.week as number,
      challengerPoints: Number(row.challenger_points),
      opponentPoints: Number(row.opponent_points),
      challengerDamage: Number(row.challenger_damage),
      opponentDamage: Number(row.opponent_damage),
    }));

    const state = playBattle(rounds);

    // A week still being played is a round still being fought, whatever the
    // duration — so a weekly duel has one round remaining right up until the
    // last game of its week is final.
    const roundsRemaining = weekIsOver
      ? challenge.duration === 'season'
        ? Math.max(0, LAST_REGULAR_WEEK - week)
        : 0
      : 1;
    const outcome = battleOutcome(state, roundsRemaining);

    const winnerId =
      outcome === 'challenger'
        ? challenge.challenger_id
        : outcome === 'opponent'
          ? challenge.opponent_id
          : null;

    // Scores on the challenge row are the fight's totals, so a season duel's
    // headline number is the whole series rather than its last week.
    const totals =
      challenge.duration === 'season'
        ? rounds.reduce(
            (sum, round) => ({
              challenger: sum.challenger + round.challengerPoints,
              opponent: sum.opponent + round.opponentPoints,
            }),
            { challenger: 0, opponent: 0 },
          )
        : { challenger: challengerPoints, opponent: opponentPoints };

    if (outcome === 'pending') {
      const { error: tickError } = await db
        .from('h2h_challenges')
        .update({
          challenger_damage: state.challengerDamage,
          opponent_damage: state.opponentDamage,
          challenger_score: totals.challenger,
          opponent_score: totals.opponent,
        })
        .eq('id', challenge.id);

      if (tickError) report.warnings.push(`challenge ${challenge.id}: ${tickError.message}`);

      if (weekIsOver) {
        // A season duel that is still running tells both fighters what the week
        // did, so a long fight has a pulse between now and January.
        await notifyRound(db, challenge, names, week, state, report);
      } else if (isCloseFight(challengerPoints, opponentPoints)) {
        // Mid-Sunday and neck and neck: the one moment in this app worth
        // looking up for. Keyed to the week, so it lands once however many
        // times grading runs over the afternoon.
        const sent = await notify(db, [
          buildDuelClose({
            challengeId: challenge.id,
            week,
            userId: challenge.challenger_id,
            opponentName: names.get(challenge.opponent_id) ?? 'Someone',
            mine: challengerPoints,
            theirs: opponentPoints,
          }),
          buildDuelClose({
            challengeId: challenge.id,
            week,
            userId: challenge.opponent_id,
            opponentName: names.get(challenge.challenger_id) ?? 'Someone',
            mine: opponentPoints,
            theirs: challengerPoints,
          }),
        ]);
        report.warnings.push(...sent.warnings);
        report.closeCalls += sent.created;
      }
      continue;
    }

    const { error: settleError } = await db
      .from('h2h_challenges')
      .update({
        status: 'completed',
        winner_id: winnerId,
        challenger_score: totals.challenger,
        opponent_score: totals.opponent,
        challenger_damage: state.challengerDamage,
        opponent_damage: state.opponentDamage,
        completed_at: now,
      })
      .eq('id', challenge.id);

    if (settleError) {
      report.warnings.push(`challenge ${challenge.id}: ${settleError.message}`);
      continue;
    }

    report.settled += 1;
    if (state.knockoutWeek !== null) report.knockouts += 1;

    // A lifetime league record only exists for a league duel; h2h_records is
    // keyed by league. A friend duel is recorded on the fighters instead, which
    // is the record that spans both.
    if (challenge.league_id) {
      await updateRecord(
        db,
        challenge,
        winnerId,
        Math.abs(totals.challenger - totals.opponent),
        report,
      );
    }

    await updateFighterRecords(db, challenge, winnerId, names, report);

    const notified = await notify(
      db,
      buildDuelResult({
        challengeId: challenge.id,
        season,
        week,
        challengerId: challenge.challenger_id,
        opponentId: challenge.opponent_id,
        challengerName: names.get(challenge.challenger_id) ?? 'Someone',
        opponentName: names.get(challenge.opponent_id) ?? 'Someone',
        winnerId,
        knockout: state.knockoutWeek !== null,
      }),
    );
    report.warnings.push(...notified.warnings);
  }

  return report;
}

/** Tell both fighters what a round of a running season duel did. */
async function notifyRound(
  db: SupabaseClient,
  challenge: ChallengeRow,
  names: Map<string, string>,
  week: number,
  state: { challengerHp: number; opponentHp: number; challengerDamage: number; opponentDamage: number },
  report: H2HReport,
): Promise<void> {
  if (challenge.duration !== 'season') return;

  // Only when something landed: a traded-nothing week is not worth a buzz.
  if (state.challengerDamage === 0 && state.opponentDamage === 0) return;

  const drafts = [
    buildDuelRound({
      challengeId: challenge.id,
      week,
      userId: challenge.challenger_id,
      opponentName: names.get(challenge.opponent_id) ?? 'Someone',
      damageDealt: state.challengerDamage,
      damageTaken: state.opponentDamage,
      myHp: state.challengerHp,
      theirHp: state.opponentHp,
    }),
    buildDuelRound({
      challengeId: challenge.id,
      week,
      userId: challenge.opponent_id,
      opponentName: names.get(challenge.challenger_id) ?? 'Someone',
      damageDealt: state.opponentDamage,
      damageTaken: state.challengerDamage,
      myHp: state.opponentHp,
      theirHp: state.challengerHp,
    }),
  ];

  const sent = await notify(db, drafts);
  report.warnings.push(...sent.warnings);
}

async function loadUsernames(
  db: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();

  const { data } = await db.from('profiles').select('user_id, username').in('user_id', unique);
  return new Map((data ?? []).map((row) => [row.user_id as string, row.username as string]));
}

/**
 * Fold a settled duel into both fighters' records.
 *
 * Upserted with the derived default for anyone who never opened the builder, so
 * a record exists for every duel rather than only for the people who bothered.
 */
async function updateFighterRecords(
  db: SupabaseClient,
  challenge: ChallengeRow,
  winnerId: string | null,
  names: Map<string, string>,
  report: H2HReport,
): Promise<void> {
  const userIds = [challenge.challenger_id, challenge.opponent_id];

  const { data: existing, error } = await db
    .from('fighters')
    .select('user_id, wins, losses, draws')
    .in('user_id', userIds);

  if (error) {
    report.warnings.push(`fighter records: ${error.message}`);
    return;
  }

  const rows = userIds.map((userId) => {
    const current = (existing ?? []).find((row) => row.user_id === userId);
    const base = defaultFighter(userId, names.get(userId) ?? 'Challenger');

    return {
      user_id: userId,
      name: base.name,
      archetype: base.archetype,
      banner: base.banner,
      wins: (current?.wins ?? 0) + (winnerId === userId ? 1 : 0),
      losses: (current?.losses ?? 0) + (winnerId !== null && winnerId !== userId ? 1 : 0),
      draws: (current?.draws ?? 0) + (winnerId === null ? 1 : 0),
    };
  });

  // The name, style and banner are only written when the row is created; an
  // upsert would otherwise reset a fighter somebody had customised back to the
  // derived default every time they won.
  const missing = rows.filter((row) => !(existing ?? []).some((e) => e.user_id === row.user_id));
  if (missing.length > 0) {
    const { error: insertError } = await db.from('fighters').insert(missing);
    if (insertError) report.warnings.push(`fighter create: ${insertError.message}`);
  }

  for (const row of rows.filter((candidate) =>
    (existing ?? []).some((e) => e.user_id === candidate.user_id),
  )) {
    const { error: updateError } = await db
      .from('fighters')
      .update({ wins: row.wins, losses: row.losses, draws: row.draws })
      .eq('user_id', row.user_id);
    if (updateError) report.warnings.push(`fighter update: ${updateError.message}`);
  }
}

/** Fold one settled challenge into the pair's lifetime league record. */
async function updateRecord(
  db: SupabaseClient,
  challenge: ChallengeRow,
  winnerId: string | null,
  margin: number,
  report: H2HReport,
): Promise<void> {
  const { userA, userB } = canonicalPair(challenge.challenger_id, challenge.opponent_id);

  const { data: existing, error } = await db
    .from('h2h_records')
    .select('*')
    .eq('league_id', challenge.league_id)
    .eq('user_a_id', userA)
    .eq('user_b_id', userB)
    .maybeSingle();

  if (error) {
    report.warnings.push(`record lookup: ${error.message}`);
    return;
  }

  const aWins = (existing?.user_a_wins ?? 0) + (winnerId === userA ? 1 : 0);
  const bWins = (existing?.user_b_wins ?? 0) + (winnerId === userB ? 1 : 0);
  const ties = (existing?.ties ?? 0) + (winnerId === null ? 1 : 0);

  // A streak belongs to whoever just won; a tie ends it.
  const previousStreakUser = existing?.current_streak_user_id ?? null;
  const streakCount =
    winnerId === null ? 0 : winnerId === previousStreakUser ? (existing?.current_streak_count ?? 0) + 1 : 1;

  const biggestMargin = Number(existing?.biggest_win_margin ?? 0);
  const row = {
    league_id: challenge.league_id,
    user_a_id: userA,
    user_b_id: userB,
    user_a_wins: aWins,
    user_b_wins: bWins,
    ties,
    // The check constraint requires these to agree, so it is computed, never
    // incremented independently.
    total_matchups: aWins + bWins + ties,
    current_streak_user_id: winnerId,
    current_streak_count: streakCount,
    biggest_win_user_id: margin > biggestMargin ? winnerId : (existing?.biggest_win_user_id ?? null),
    biggest_win_margin: Math.max(biggestMargin, margin),
    closest_margin:
      existing?.closest_margin === null || existing?.closest_margin === undefined
        ? margin
        : Math.min(Number(existing.closest_margin), margin),
    last_matchup_at: new Date().toISOString(),
  };

  const { error: upsertError } = await db
    .from('h2h_records')
    .upsert(row, { onConflict: 'league_id,user_a_id,user_b_id' });

  if (upsertError) report.warnings.push(`record upsert: ${upsertError.message}`);
}

export { MAX_HP };
