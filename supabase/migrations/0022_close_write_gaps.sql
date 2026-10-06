-- Close five write policies that checked who you are but not where you are.
--
-- Found by auditing every INSERT policy on a table carrying a league_id and
-- asking which ones never mention membership. The serious one is first.
--
-- 1. league_members_insert_self said only `user_id = auth.uid()`, which meant
--    anybody holding a league's id could insert themselves into it and read
--    the whole league — bypassing the invite code completely. League ids are
--    in URLs, so this was not hard to come by.
--
--    It turns out nothing legitimate used the policy at all: creating a league
--    and joining one both run through SECURITY DEFINER functions (create_league
--    and join_league_by_code), which do not consult RLS. So it is removed
--    rather than tightened. The invite code is the only way in again.
--
-- 2-5. A pot, a survivor pool, a playground card and a pot_audit entry could
--    each be created against a league the author was not in. Lower stakes —
--    you would need the league id, and the rows are mostly cosmetic — except
--    for the pot, which decides who is recorded as having paid, and the audit
--    trail, which is the thing that settles an argument about exactly that.

drop policy if exists league_members_insert_self on public.league_members;

drop policy if exists pots_write_owner on public.pots;
create policy pots_write_owner on public.pots
  for all using (owner_id = auth.uid() or public.is_admin())
  with check (
    (owner_id = auth.uid() or public.is_admin())
    and (league_id is null or public.is_league_member(league_id))
  );

drop policy if exists survivor_pools_write_commissioner on public.survivor_pools;
create policy survivor_pools_write_commissioner on public.survivor_pools
  for all using (commissioner_id = auth.uid() or public.is_admin())
  with check (
    (commissioner_id = auth.uid() or public.is_admin())
    and (league_id is null or public.is_league_member(league_id))
  );

drop policy if exists playground_cards_write_own on public.playground_cards;
create policy playground_cards_write_own on public.playground_cards
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_league_member(league_id));

-- An audit entry has to be about a pot you can actually see, or the trail can
-- be filled with rows about pots the writer has nothing to do with.
drop policy if exists pot_audit_insert on public.pot_audit;
create policy pot_audit_insert on public.pot_audit
  for insert with check (
    actor_id = auth.uid()
    and exists (
      select 1 from public.pots p
      where p.id = pot_audit.pot_id
        and (p.owner_id = auth.uid() or (p.league_id is not null and public.is_league_member(p.league_id)))
    )
  );
