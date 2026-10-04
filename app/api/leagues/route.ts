// League creation and joining.
//
// Both delegate to SECURITY DEFINER database functions. Creating a league needs
// two writes that must both succeed; joining needs to read a league the joiner
// is not yet allowed to see, with the invite code as the credential. Doing
// either from the client would mean either an orphaned league or an RLS policy
// that exposes every league.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function currentSeason(now = new Date()): number {
  // An NFL season is named for the year it starts; January and February belong
  // to the previous season's playoffs.
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
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

  const { name } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 48) {
    return Response.json({ error: 'League names are 3–48 characters.' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .rpc('create_league', { league_name: name.trim(), league_season: currentSeason() })
    .single<{ league_id: string; invite_code: string }>();

  if (error || !data) {
    return Response.json(
      { error: error?.message ?? 'Could not create that league.' },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, leagueId: data.league_id, inviteCode: data.invite_code });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { inviteCode } = (body ?? {}) as Record<string, unknown>;
  if (typeof inviteCode !== 'string' || !/^[A-Za-z0-9]{6,10}$/.test(inviteCode.trim())) {
    return Response.json({ error: 'That invite code does not look right.' }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .rpc('join_league_by_code', { code: inviteCode.trim() })
    .single<{ league_id: string; league_name: string }>();

  if (error) {
    // The function raises distinct SQLSTATEs so the right message and status
    // can be chosen without string-matching.
    const status =
      error.code === '23505' || error.message.includes('already a member')
        ? 409
        : error.message.includes('no league')
          ? 404
          : 400;

    const message =
      status === 409
        ? "You're already in this league."
        : status === 404
          ? 'No league found for that code.'
          : 'That invite code does not look right.';

    return Response.json({ error: message }, { status });
  }

  return Response.json({ ok: true, leagueId: data.league_id, name: data.league_name });
}
