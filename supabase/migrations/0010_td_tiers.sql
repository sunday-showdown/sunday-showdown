-- Replace the derived TD point value with three tiers.
--
-- The old function was 1 / (scoring rate shrunk toward a prior), bounded to
-- [1, 30]. It produced defensible numbers and could not be explained to anyone:
-- a player could not look at a name and know what it was worth. It also sat on
-- a different scale from Pick'em, so one TD pick could outweigh a whole card.
--
-- Tiers instead. A player is bucketed by how often he actually scores, and the
-- bucket is the payout, on the same 1-8 scale as everything else.

drop function if exists public.derive_td_point_value(integer, integer, numeric, numeric);

create type td_tier as enum ('lock', 'solid', 'longshot');

alter table public.td_values add column if not exists tier td_tier;

-- Which tier a player belongs to.
--
-- Under three games there is no meaningful rate yet, so he starts as 'solid'
-- rather than being written off as a long shot on one quiet appearance.
create or replace function public.td_tier_for(total_tds integer, games_played integer)
returns td_tier
language sql
immutable
as $$
  select case
    when coalesce(games_played, 0) < 3 then 'solid'::td_tier
    when coalesce(total_tds, 0)::numeric / games_played >= 0.5 then 'lock'::td_tier
    when coalesce(total_tds, 0)::numeric / games_played >= 0.25 then 'solid'::td_tier
    else 'longshot'::td_tier
  end;
$$;

create or replace function public.td_points_for_tier(t td_tier)
returns numeric
language sql
immutable
as $$
  select case t
    when 'lock' then 2
    when 'solid' then 4
    when 'longshot' then 8
  end::numeric;
$$;

create or replace function public.derive_td_points(total_tds integer, games_played integer)
returns numeric
language sql
immutable
as $$
  select public.td_points_for_tier(public.td_tier_for(total_tds, games_played));
$$;

-- Backfill any rows that already exist, then make the column required for new
-- ones. Nothing has been graded yet, so no history is being rewritten.
update public.td_values
set tier = public.td_tier_for(computed_total_tds, computed_games_played)
where tier is null;

update public.td_values
set td_point_value = public.td_points_for_tier(tier)
where frozen_at is null;

alter table public.td_values
  alter column tier set default 'solid',
  alter column tier set not null;

-- A tier's payout is fixed, so a frozen value must match its tier. An admin
-- override changes the tier, not an arbitrary number — which keeps every value
-- in the league explainable.
alter table public.td_values
  add constraint td_values_matches_tier
  check (td_point_value = case tier when 'lock' then 2 when 'solid' then 4 when 'longshot' then 8 end);
