// Pick submission.
//
// Server-authoritative by construction: the client sends only a game, a market
// and a side. The line and price are read from the database's active odds, the
// lock is checked here and again by a database trigger, and league membership
// is enforced by RLS on the insert.
//
// Partial submissions are supported. The previous build replaced the whole
// card on every save and deleted anything deselected, which meant submitting
// one pick from a game page wiped the rest of the week.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import {
  parseSubmittedPicks,
  resolveContestLine,
  validateSubmission,
  type Rejection,
} from '@/lib/picks';

export const dynamic = 'force-dynamic';

interface ChallengeRow {
  id: string;
  league_id: string;
  season: number;
  week: number;
  enabled_markets: string[];
  lock_time: string;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { challengeId, picks: rawPicks, clear: rawClear } = (body ?? {}) as Record<string, unknown>;

  if (typeof challengeId !== 'string' || !challengeId) {
    return Response.json({ error: 'challengeId is required' }, { status: 400 });
  }

  const picks = parseSubmittedPicks(rawPicks ?? []);
  if (!picks) {
    return Response.json({ error: 'picks payload is malformed' }, { status: 400 });
  }

  const clear = Array.isArray(rawClear)
    ? rawClear.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];

  const supabase = await createServerSupabase();

  // RLS limits this to challenges in leagues the user belongs to, so a
  // challenge id from another league reads as not found.
  const { data: challenge, error: challengeError } = await supabase
    .from('pickem_challenges')
    .select('id, league_id, season, week, enabled_markets, lock_time')
    .eq('id', challengeId)
    .maybeSingle<ChallengeRow>();

  if (challengeError) {
    return Response.json({ error: 'could not load contest' }, { status: 500 });
  }
  if (!challenge) {
    return Response.json({ error: 'contest not found' }, { status: 404 });
  }

  const { data: games, error: gamesError } = await supabase
    .from('nfl_games')
    .select('id, start_time')
    .eq('season', challenge.season)
    .eq('week', challenge.week);

  if (gamesError) {
    return Response.json({ error: 'could not load slate' }, { status: 500 });
  }

  const kickoffByGameId = new Map<string, string>(
    (games ?? []).map((g) => [g.id as string, g.start_time as string]),
  );

  const { accepted, rejected } = validateSubmission(picks, {
    enabledMarkets: challenge.enabled_markets,
    kickoffByGameId,
    lockTime: challenge.lock_time,
  });

  const allRejections: Rejection[] = [...rejected];
  const rows: Record<string, unknown>[] = [];

  if (accepted.length > 0) {
    const { data: oddsRows, error: oddsError } = await supabase
      .from('nfl_game_odds')
      .select('game_id, market_type, selection, line, american_odds')
      .in('game_id', accepted.map((p) => p.gameId))
      .eq('is_active', true);

    if (oddsError) {
      return Response.json({ error: 'could not load odds' }, { status: 500 });
    }

    type OddsRecord = { market_type: string; selection: string; line: number | null; american_odds: number | null };
    const oddsByGame = new Map<string, OddsRecord[]>();
    for (const row of oddsRows ?? []) {
      const gameId = row.game_id as string;
      const list = oddsByGame.get(gameId) ?? [];
      list.push({
        market_type: row.market_type as string,
        selection: row.selection as string,
        line: row.line === null ? null : Number(row.line),
        american_odds: row.american_odds as number | null,
      });
      oddsByGame.set(gameId, list);
    }

    for (const pick of accepted) {
      const resolved = resolveContestLine(
        pick.marketType,
        pick.selection,
        oddsByGame.get(pick.gameId) ?? [],
      );

      // No posted line means no pick: storing one would produce a row grading
      // can never settle.
      if (!resolved) {
        allRejections.push({ gameId: pick.gameId, reason: 'no_line' });
        continue;
      }

      rows.push({
        user_id: user.id,
        league_id: challenge.league_id,
        challenge_id: challenge.id,
        game_id: pick.gameId,
        season: challenge.season,
        week: challenge.week,
        market_type: pick.marketType,
        selection: pick.selection,
        contest_line: resolved.contestLine,
        contest_odds: resolved.contestOdds,
        result: 'pending',
        points: 0,
      });
    }
  }

  let saved = 0;
  if (rows.length > 0) {
    // Upsert on the one-pick-per-game key: changing a selection replaces the
    // existing pick rather than colliding with it.
    const { error: upsertError, count } = await supabase
      .from('picks')
      .upsert(rows, { onConflict: 'user_id,challenge_id,game_id', count: 'exact' });

    if (upsertError) {
      // The lock trigger raises as a check violation; surface it as a 409 so the
      // client can tell "too late" apart from "broken".
      const locked = upsertError.message.includes('are locked');
      return Response.json(
        { error: locked ? 'picks are locked' : 'could not save picks' },
        { status: locked ? 409 : 500 },
      );
    }
    saved = count ?? rows.length;
  }

  let cleared = 0;
  if (clear.length > 0) {
    const { error: deleteError, count } = await supabase
      .from('picks')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('challenge_id', challenge.id)
      .in('game_id', clear);

    if (deleteError) {
      const locked = deleteError.message.includes('are locked');
      return Response.json(
        { error: locked ? 'picks are locked' : 'could not clear picks' },
        { status: locked ? 409 : 500 },
      );
    }
    cleared = count ?? 0;
  }

  return Response.json({
    ok: allRejections.length === 0,
    saved,
    cleared,
    rejected: allRejections,
  });
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const challengeId = new URL(request.url).searchParams.get('challengeId');
  if (!challengeId) {
    return Response.json({ error: 'challengeId is required' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('picks')
    .select('id, game_id, market_type, selection, contest_line, contest_odds, result, points')
    .eq('user_id', user.id)
    .eq('challenge_id', challengeId);

  if (error) return Response.json({ error: 'could not load picks' }, { status: 500 });
  return Response.json({ picks: data ?? [] });
}
