-- Fix: infinite recursion in the survivor_members policy.
--
-- 0018 gave survivor_members a read policy that asked "is this person in this
-- pool?" with a subquery against survivor_members — which re-enters the same
-- policy, which asks again. Postgres detects the loop and fails every query
-- that touches the table, so Survivor showed "no pool running" to people who
-- were in one.
--
-- The repair is the pattern already used for leagues: a SECURITY DEFINER
-- function, which runs as its owner and therefore does not re-enter RLS. See
-- is_league_member in migration 0002.

create or replace function public.is_pool_member(target_pool uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.survivor_members m
    where m.pool_id = target_pool and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_pool_member(uuid) from public;
grant execute on function public.is_pool_member(uuid) to authenticated;

drop policy if exists survivor_members_read on public.survivor_members;
create policy survivor_members_read on public.survivor_members
  for select using (
    user_id = auth.uid()
    or public.is_pool_member(pool_id)
    or public.is_admin()
  );

drop policy if exists survivor_pools_read on public.survivor_pools;
create policy survivor_pools_read on public.survivor_pools
  for select using (
    commissioner_id = auth.uid()
    or public.is_pool_member(id)
    or (league_id is not null and public.is_league_member(league_id))
    or public.is_admin()
  );
