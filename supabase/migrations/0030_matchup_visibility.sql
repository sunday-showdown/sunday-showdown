-- Let a matchup be looked at.
--
-- picks_read_own means exactly what it says: nobody has ever been able to see
-- anybody else's pick, at any point, including after the game finished. That is
-- the right default before kickoff — a league where you could read the card you
-- are playing against would not be a competition — and the wrong one afterwards,
-- when the whole interest of a duel or a league week is seeing where it was won.
--
-- So picks become readable once the game they are on has started, which is the
-- same rule survivor_picks has had since migration 0006, and only to people with
-- a reason to be looking: somebody in the same league, or somebody on the other
-- side of a duel that week.
--
-- Nothing else changes. Before kickoff a pick is as private as it ever was, and
-- a stranger with neither a shared league nor a duel sees nothing at any point.

/**
 * Whether the caller and another player are in a duel covering a given week.
 *
 * SECURITY DEFINER for the usual reason: it is called from a policy, and a
 * policy that reads a table with policies of its own is how migration 0018
 * deadlocked. A pending duel does not count — you cannot see the card of
 * somebody who has not agreed to fight you.
 */
create or replace function public.shares_duel(
  other_user uuid,
  target_season integer,
  target_week integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.h2h_challenges c
    where c.season = target_season
      and c.status in ('accepted', 'completed')
      and (
        (c.challenger_id = auth.uid() and c.opponent_id = other_user)
        or (c.opponent_id = auth.uid() and c.challenger_id = other_user)
      )
      and (
        (c.duration = 'season' and c.week <= target_week)
        or (c.duration <> 'season' and c.week = target_week)
      )
  );
$$;

revoke all on function public.shares_duel(uuid, integer, integer) from public;
grant execute on function public.shares_duel(uuid, integer, integer) to authenticated;


drop policy if exists picks_read_after_kickoff on public.picks;
create policy picks_read_after_kickoff on public.picks
  for select using (
    exists (
      select 1 from public.nfl_games g
      where g.id = picks.game_id and now() >= g.start_time
    )
    and (
      public.is_league_member(picks.league_id)
      or public.shares_duel(picks.user_id, picks.season, picks.week)
    )
  );
