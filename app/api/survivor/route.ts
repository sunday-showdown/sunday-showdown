// Survivor pick submission and pool creation.
//
// Server-authoritative like Pick'em: the client names a team, and the server
// resolves which game that team plays in, which side they are, and whether the
// pick is still legal. The database enforces one pick per week and no reuse.

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

  const { poolId, week, teamAbbr } = (body ?? {}) as Record<string, unknown>;

  if (typeof poolId !== 'string' || !poolId) {
    return Response.json({ error: 'poolId is required' }, { status: 400 });
  }
  if (typeof teamAbbr !== 'string' || !/^[A-Z]{2,4}$/.test(teamAbbr)) {
    return Response.json({ error: 'teamAbbr is not valid' }, { status: 400 });
  }
  if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > 22) {
    return Response.json({ error: 'week is not valid' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: pool, error: poolError } = await supabase
    .from('survivor_pools')
    .select('id, season, status')
    .eq('id', poolId)
    .maybeSingle();

  if (poolError) return Response.json({ error: 'could not load pool' }, { status: 500 });
  if (!pool) return Response.json({ error: 'pool not found' }, { status: 404 });
  if (pool.status === 'completed' || pool.status === 'cancelled') {
    return Response.json({ error: 'this pool is finished' }, { status: 409 });
  }

  // Find the game this team plays this week — the server decides, not the client.
  const { data: games, error: gamesError } = await supabase
    .from('nfl_games')
    .select('id, home_abbr, away_abbr, start_time, status')
    .eq('season', pool.season)
    .eq('week', week)
    .or(`home_abbr.eq.${teamAbbr},away_abbr.eq.${teamAbbr}`);

  if (gamesError) return Response.json({ error: 'could not load the slate' }, { status: 500 });

  const game = (games ?? [])[0];
  if (!game) {
    return Response.json(
      { error: `${teamAbbr} is not playing in week ${week}` },
      { status: 400 },
    );
  }

  if (new Date(game.start_time as string).getTime() <= Date.now()) {
    return Response.json({ error: 'that game has already kicked off' }, { status: 409 });
  }

  const isHome = (game.home_abbr as string) === teamAbbr;
  const opponent = isHome ? (game.away_abbr as string) : (game.home_abbr as string);

  const { error: upsertError } = await supabase.from('survivor_picks').upsert(
    {
      pool_id: poolId,
      user_id: user.id,
      season: pool.season,
      week,
      team_abbr: teamAbbr,
      game_id: game.id,
      opponent_abbr: opponent,
      is_home: isHome,
      result: 'pending',
    },
    { onConflict: 'pool_id,user_id,season,week' },
  );

  if (upsertError) {
    // The no-reuse rule is a unique constraint; translate it into something a
    // player can act on.
    const reused = upsertError.message.includes('pool_id_user_id_team_abbr');
    const locked = upsertError.message.includes('locked');
    return Response.json(
      {
        error: reused
          ? `You have already used ${teamAbbr} in this pool.`
          : locked
            ? 'That pick is locked.'
            : 'Could not save that pick.',
      },
      { status: reused || locked ? 409 : 500 },
    );
  }

  return Response.json({ ok: true, teamAbbr, opponent, isHome });
}

/** Create a pool. The creator is its commissioner and first entrant. */
export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { name, leagueId, season, buyIn } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 48) {
    return Response.json({ error: 'Pool names are 3–48 characters.' }, { status: 400 });
  }
  if (typeof season !== 'number' || !Number.isInteger(season)) {
    return Response.json({ error: 'season is required' }, { status: 400 });
  }

  // A pot is optional. Zero and absent mean the same thing — play for pride.
  const stake = buyIn === null || buyIn === undefined || buyIn === '' ? 0 : Number(buyIn);
  if (!Number.isFinite(stake) || stake < 0 || stake > 100000) {
    return Response.json({ error: 'That buy-in does not look right.' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('survivor_pools')
    .insert({
      name: name.trim(),
      league_id: typeof leagueId === 'string' ? leagueId : null,
      commissioner_id: user.id,
      season,
      status: 'open',
      buy_in: stake,
      pot_enabled: stake > 0,
    })
    .select('id, invite_code')
    .single();

  if (error || !data) {
    return Response.json({ error: 'Could not create that pool.' }, { status: 500 });
  }

  // The creator is in their own pool. A trigger cannot do this, because the
  // membership row is what RLS reads to decide who may see the pool at all.
  await supabase.from('survivor_members').insert({ pool_id: data.id, user_id: user.id });

  // The pot belongs to this pool rather than to survivor in general, so two
  // pools in one league can run different buy-ins.
  if (stake > 0 && typeof leagueId === 'string') {
    await supabase.from('pots').insert({
      name: name.trim(),
      competition_type: 'survivor',
      competition_id: data.id,
      league_id: leagueId,
      owner_id: user.id,
      season,
      buy_in: stake,
      status: 'open',
    });
  }

  return Response.json({ ok: true, poolId: data.id, inviteCode: data.invite_code });
}
