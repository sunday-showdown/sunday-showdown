-- Let the people in a pot see the pot.
--
-- Two gaps, both from the same assumption: that a pot always belongs to a
-- league and that the league is therefore the audience.
--
-- A pot could only be read by its owner or by members of its league. A survivor
-- pool can be started by anybody and joined with a code, so it may contain
-- friends from outside any league and need not belong to one at all — and those
-- people could not see the pot they had been asked to pay into.
--
-- And pot_participants was readable only by the participant themselves or the
-- pot's owner, which quietly made the shared ledger private: the "who has paid"
-- list that the whole feature is for showed real data to the owner and showed
-- everybody else a list in which nobody had paid. Who has settled up is the one
-- thing a pot exists to publish.
--
-- Nothing becomes visible to anybody outside the competition it belongs to.

drop policy if exists pots_read on public.pots;
create policy pots_read on public.pots
  for select using (
    owner_id = auth.uid()
    or (league_id is not null and public.is_league_member(league_id))
    -- For a pot attached to one competition, the competition is the audience.
    -- competition_id is the survivor pool's id; for the league-wide modes it is
    -- null and this adds nothing.
    or (competition_id is not null and public.is_pool_member(competition_id))
    or public.is_admin()
  );

drop policy if exists pot_participants_read on public.pot_participants;
create policy pot_participants_read on public.pot_participants
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.pots p
      where p.id = pot_participants.pot_id
        and (
          p.owner_id = auth.uid()
          or (p.league_id is not null and public.is_league_member(p.league_id))
          or (p.competition_id is not null and public.is_pool_member(p.competition_id))
        )
    )
    or public.is_admin()
  );
