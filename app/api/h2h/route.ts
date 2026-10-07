// Duels.
//
// Creating one is guarded by a unique constraint per pair per week (and a
// partial one for duels outside a league, where NULL league_ids would otherwise
// not collide), so a double-tap or a retrying client cannot spam somebody's
// inbox.
//
// Who may be challenged is decided by the insert policy in migration 0024: a
// league mate, or a friend — mutual follows, never a one-way follow. The checks
// here exist to produce a readable error rather than to be the guard.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { resolveLeague } from '@/lib/league';
import { buildDuelInvite } from '@/lib/notifications';
import { notify } from '@/lib/notify';
import { LAST_REGULAR_WEEK } from '@/lib/h2h';

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

  const { opponentId, leagueId, duration } = (body ?? {}) as Record<string, unknown>;

  if (typeof opponentId !== 'string' || !opponentId) {
    return Response.json({ error: 'opponentId is required' }, { status: 400 });
  }
  if (opponentId === user.id) {
    return Response.json({ error: 'You cannot challenge yourself.' }, { status: 400 });
  }
  if (duration !== undefined && duration !== 'week' && duration !== 'season') {
    return Response.json({ error: 'duration must be week or season' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  // My card always comes from my active league, whatever the duel's scope — a
  // duel does not change which league I am playing in.
  const { league: myLeague } = await resolveLeague(supabase, user.id);
  if (!myLeague) {
    return Response.json(
      { error: 'Join a league first — a duel is played with your Pick’em card.' },
      { status: 409 },
    );
  }

  // Which league, if any, the two of us share.
  //
  // Worked out here rather than taken from the request. The client used to have
  // to name the league, the arena did not name one because a duel is not a
  // league feature, and so every challenge was submitted as a friend duel —
  // which the insert policy then refused unless the two players also followed
  // each other. Challenging a league mate failed outright, with an error
  // message about friendship that had nothing to do with it.
  //
  // A named league is still honoured as a preference when it is one we really
  // do share; otherwise any shared league will do, with the active one first so
  // the duel lands where the challenger is actually playing.
  const { data: shared } = await supabase
    .from('league_members')
    .select('league_id')
    .eq('user_id', opponentId);

  const theirLeagues = new Set(((shared ?? []) as { league_id: string }[]).map((r) => r.league_id));

  const { data: mineRows } = await supabase
    .from('league_members')
    .select('league_id')
    .eq('user_id', user.id);

  const common = ((mineRows ?? []) as { league_id: string }[])
    .map((r) => r.league_id)
    .filter((id) => theirLeagues.has(id));

  const sharedLeagueId =
    (typeof leagueId === 'string' && common.includes(leagueId) ? leagueId : null) ??
    (common.includes(myLeague.id) ? myLeague.id : (common[0] ?? null));

  const insert = {
    challenger_id: user.id,
    opponent_id: opponentId,
    league_id: sharedLeagueId,
    challenger_league_id: myLeague.id,
    challenge_type: 'pickem',
    duration: duration ?? 'week',
    season: myLeague.season,
    // A season duel still records a week: the one it starts from, so accepting
    // in week 10 cannot retroactively settle weeks 1 to 9.
    week: Math.min(myLeague.current_week, LAST_REGULAR_WEEK),
    status: 'pending',
  };

  const { data: created, error } = await supabase
    .from('h2h_challenges')
    .insert(insert)
    .select('id')
    .maybeSingle();

  if (error) {
    const duplicate = error.message.includes('duplicate') || error.code === '23505';
    // 42501 is "new row violates row-level security", which here means the
    // opponent is neither a league mate nor a mutual follow.
    const notAllowed = error.code === '42501';

    return Response.json(
      {
        error: duplicate
          ? 'You already have a duel open with them.'
          : notAllowed
            ? 'You can only challenge a league mate or a friend who follows you back.'
            : 'Could not send that challenge.',
      },
      { status: duplicate ? 409 : notAllowed ? 403 : 500 },
    );
  }

  // Tell them, on their phone. Being called out is the one notification in this
  // app that is worth interrupting somebody for.
  if (created?.id) {
    const [{ data: me }, { data: fighter }] = await Promise.all([
      supabase.from('profiles').select('username').eq('user_id', user.id).maybeSingle(),
      supabase.from('fighters').select('taunt').eq('user_id', user.id).maybeSingle(),
    ]);

    const sent = await notify(supabase, [
      buildDuelInvite({
        challengeId: created.id as string,
        opponentId,
        challengerName: (me?.username as string) ?? 'Someone',
        duration: (duration as 'week' | 'season') ?? 'week',
        week: insert.week,
        taunt: (fighter?.taunt as string) ?? null,
      }),
    ]);

    // A challenge that was created but could not be announced is still a
    // challenge; it will be seen on the arena screen.
    if (sent.warnings.length > 0) console.warn('duel invite notify', sent.warnings);
  }

  return Response.json({ ok: true, id: created?.id ?? null });
}

/**
 * Answer a challenge, withdraw one you sent, or mark one as seen.
 *
 * Accepting records which league the accepting side's card is read from, which
 * is what lets grading settle a duel between two people who share no league.
 */
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { challengeId, action } = (body ?? {}) as Record<string, unknown>;
  if (typeof challengeId !== 'string' || !challengeId) {
    return Response.json({ error: 'challengeId is required' }, { status: 400 });
  }
  if (action !== 'accept' && action !== 'decline' && action !== 'cancel' && action !== 'seen') {
    return Response.json({ error: 'unknown action' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: challenge, error: loadError } = await supabase
    .from('h2h_challenges')
    .select('id, challenger_id, opponent_id, status, league_id')
    .eq('id', challengeId)
    .maybeSingle();

  if (loadError) return Response.json({ error: 'could not load that challenge' }, { status: 500 });
  if (!challenge) return Response.json({ error: 'challenge not found' }, { status: 404 });

  const isOpponent = challenge.opponent_id === user.id;
  const isChallenger = challenge.challenger_id === user.id;

  // Marking a challenge seen is idempotent and allowed at any status: it only
  // stops the arrival animation replaying.
  if (action === 'seen') {
    if (!isOpponent) return Response.json({ error: 'that is not yours to do' }, { status: 403 });
    await supabase
      .from('h2h_challenges')
      .update({ seen_at: new Date().toISOString() })
      .eq('id', challengeId)
      .is('seen_at', null);
    return Response.json({ ok: true });
  }

  if (challenge.status !== 'pending') {
    return Response.json({ error: 'that challenge is no longer open' }, { status: 409 });
  }

  // Only the right party may take each action: the recipient answers, the
  // sender withdraws.
  if ((action === 'cancel' && !isChallenger) || (action !== 'cancel' && !isOpponent)) {
    return Response.json({ error: 'that is not yours to do' }, { status: 403 });
  }

  const now = new Date().toISOString();
  let update: Record<string, unknown>;

  if (action === 'accept') {
    const { league } = await resolveLeague(supabase, user.id);
    if (!league) {
      return Response.json(
        { error: 'Join a league first — a duel is played with your Pick’em card.' },
        { status: 409 },
      );
    }
    // Which league my score is read from. For a duel inside a shared league
    // that is the league itself; for a friend duel it is whichever league I am
    // playing in, recorded now so grading never has to guess later.
    update = {
      status: 'accepted',
      accepted_at: now,
      seen_at: now,
      opponent_league_id: challenge.league_id ?? league.id,
    };
  } else {
    update = {
      status: action === 'decline' ? 'declined' : 'cancelled',
      cancelled_at: now,
      ...(action === 'decline' ? { seen_at: now } : {}),
    };
  }

  const { error } = await supabase.from('h2h_challenges').update(update).eq('id', challengeId);
  if (error) return Response.json({ error: 'could not update that challenge' }, { status: 500 });

  return Response.json({ ok: true, status: update.status });
}
