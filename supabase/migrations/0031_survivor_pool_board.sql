-- Who is in, who is out, and who has locked a pick in.
--
-- Survivor showed you your own run and nothing else: not who else was alive,
-- not what anybody had picked, not what they had already spent. Which removes
-- the part of survivor that makes it survivor — you are meant to be watching
-- the field thin out.
--
-- Most of that is already readable. survivor_picks reveals a pick once its game
-- has kicked off (migration 0006), so every past week is visible to the pool
-- and every elimination is public the moment it happens. The one thing that
-- cannot be read is the gap between "has not picked yet" and "has picked, and
-- you may not see it" — the row is simply absent either way, and inferring a
-- hidden pick from an absent row is not possible.
--
-- That distinction is not a secret in any survivor pool anyone has ever run:
-- who is locked in is public, which team they took is not. This returns exactly
-- that, and the team only when it is already readable.

create or replace function public.survivor_week_status(target_pool uuid, target_week integer)
returns table (
  user_id uuid,
  has_picked boolean,
  team_abbr text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    (p.id is not null) as has_picked,
    -- Your own pick always, anybody else's only once their game is under way.
    case
      when p.id is null then null
      when m.user_id = auth.uid() then p.team_abbr
      when exists (
        select 1 from public.nfl_games g
        where g.id = p.game_id and now() >= g.start_time
      ) then p.team_abbr
      else null
    end as team_abbr
  from public.survivor_members m
  left join public.survivor_picks p
    on p.pool_id = m.pool_id and p.user_id = m.user_id and p.week = target_week
  where m.pool_id = target_pool
    -- Only somebody in the pool may ask about the pool.
    and public.is_pool_member(target_pool);
$$;

revoke all on function public.survivor_week_status(uuid, integer) from public;
grant execute on function public.survivor_week_status(uuid, integer) to authenticated;
