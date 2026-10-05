// TD Scorer pick submission.
//
// Server-authoritative like Pick'em: the client names a player, and the price
// is read from the frozen-or-current td_values row. A crafted request cannot
// award itself a long-shot payout on a star.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { challengeId, playerId, clear } = (body ?? {}) as Record<string, unknown>;

  if (typeof challengeId !== 'string' || !challengeId) {
    return Response.json({ error: 'challengeId is required' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: challenge, error: challengeError } = await supabase
    .from('pickem_challenges')
    .select('id, league_id, season, week, lock_time')
    .eq('id', challengeId)
    .maybeSingle();

  if (challengeError) return Response.json({ error: 'could not load contest' }, { status: 500 });
  if (!challenge) return Response.json({ error: 'contest not found' }, { status: 404 });

  if (clear === true) {
    if (typeof playerId !== 'string') {
      return Response.json({ error: 'playerId is required to clear' }, { status: 400 });
    }
    const { error } = await supabase
      .from('td_picks')
      .delete()
      .eq('user_id', user.id)
      .eq('challenge_id', challengeId)
      .eq('player_id', playerId);

    if (error) {
      const locked = error.message.includes('locked');
      return Response.json(
        { error: locked ? 'TD picks are locked.' : 'Could not clear that pick.' },
        { status: locked ? 409 : 500 },
      );
    }
    return Response.json({ ok: true, cleared: true });
  }

  if (typeof playerId !== 'string' || !playerId) {
    return Response.json({ error: 'playerId is required' }, { status: 400 });
  }

  // The price comes from the stored value, never the request.
  const { data: value, error: valueError } = await supabase
    .from('td_values')
    .select('id, td_point_value, american_odds')
    .eq('league_id', challenge.league_id)
    .eq('player_id', playerId)
    .eq('season', challenge.season)
    .eq('week', challenge.week)
    .maybeSingle();

  if (valueError) return Response.json({ error: 'could not load that price' }, { status: 500 });
  if (!value) {
    return Response.json({ error: 'that player is not available this week' }, { status: 400 });
  }

  const { data: candidate } = await supabase
    .from('td_players')
    .select('game_id, team_abbr, opponent_abbr, position')
    .eq('player_id', playerId)
    .eq('season', challenge.season)
    .eq('week', challenge.week)
    .maybeSingle();

  if (!candidate) {
    return Response.json({ error: 'that player is not on this week’s slate' }, { status: 400 });
  }

  const { error } = await supabase.from('td_picks').insert({
    user_id: user.id,
    league_id: challenge.league_id,
    challenge_id: challengeId,
    season: challenge.season,
    week: challenge.week,
    player_id: playerId,
    game_id: candidate.game_id,
    team_abbr: candidate.team_abbr,
    opponent_abbr: candidate.opponent_abbr,
    position: candidate.position,
    td_value_id: value.id,
    td_point_value: value.td_point_value,
  });

  if (error) {
    const duplicate = error.message.includes('duplicate') || error.code === '23505';
    const locked = error.message.includes('locked');
    return Response.json(
      {
        error: duplicate
          ? 'You already have that player.'
          : locked
            ? 'TD picks are locked.'
            : 'Could not save that pick.',
      },
      { status: duplicate || locked ? 409 : 500 },
    );
  }

  return Response.json({ ok: true, points: Number(value.td_point_value) });
}
