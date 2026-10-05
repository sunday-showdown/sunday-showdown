-- Price every pick from its odds.
--
-- Fixed points per market could be arbitraged: at a -0.5 spread, the spread and
-- the moneyline are the SAME bet, so paying the spread more was free points.
-- 0010's TD tiers had the same shape of problem — a fixed payout detached from
-- how likely the pick actually was.
--
-- One rule now applies everywhere: a pick is a $10 stake and it pays the
-- decimal odds. Equivalent bets pay equally because the book priced them
-- equally, and every option carries roughly the same expected value, so no
-- market or side is ever strictly better.

-- The tier constraint hard-coded 2/4/8 and has to go; the tier column stays as
-- a display band for grouping names in the UI.
alter table public.td_values drop constraint if exists td_values_matches_tier;

-- TD picks get a price like everything else, estimated from scoring rate
-- because no free source publishes anytime-TD props.
alter table public.td_values add column if not exists american_odds integer;

drop function if exists public.derive_td_points(integer, integer);
drop function if exists public.td_points_for_tier(td_tier);

-- A player's chance of scoring, shrunk toward the league average so a backup
-- who scored in his only appearance is not priced as the safest pick on the
-- board. Mirrors tdScoringProbability in lib/types.ts.
create or replace function public.td_scoring_probability(total_tds integer, games_played integer)
returns numeric
language sql
immutable
as $$
  select least(0.9, greatest(0.02,
    (greatest(coalesce(total_tds, 0), 0) + 0.18 * 4)::numeric
    / (greatest(coalesce(games_played, 0), 0) + 4)
  ));
$$;

create or replace function public.probability_to_american(p numeric)
returns integer
language sql
immutable
as $$
  select case
    when p is null or p <= 0 or p >= 1 then null
    when p >= 0.5 then -round(100 * p / (1 - p))::integer
    else round(100 * (1 - p) / p)::integer
  end;
$$;

-- The payout rule, in the database as well as the application, so a backfill
-- and a live grade can never disagree.
create or replace function public.points_for_odds(american integer)
returns numeric
language sql
immutable
as $$
  select case
    when american is null or abs(american) < 100 then 19
    else least(150, round(10 * (
      case when american > 0 then 1 + american / 100.0 else 1 + 100.0 / abs(american) end
    )))
  end::numeric;
$$;

create or replace function public.derive_td_points(total_tds integer, games_played integer)
returns numeric
language sql
immutable
as $$
  select public.points_for_odds(
    public.probability_to_american(public.td_scoring_probability(total_tds, games_played))
  );
$$;

-- Re-price anything already stored. Nothing is frozen or graded yet, so no
-- history is being rewritten.
update public.td_values
set american_odds = public.probability_to_american(
      public.td_scoring_probability(computed_total_tds, computed_games_played)
    ),
    td_point_value = public.derive_td_points(computed_total_tds, computed_games_played)
where frozen_at is null;

-- Display band, widened to match the new thresholds in lib/types.ts.
create or replace function public.td_tier_for(total_tds integer, games_played integer)
returns td_tier
language sql
immutable
as $$
  select case
    when public.td_scoring_probability(total_tds, games_played) >= 0.45 then 'lock'::td_tier
    when public.td_scoring_probability(total_tds, games_played) >= 0.22 then 'solid'::td_tier
    else 'longshot'::td_tier
  end;
$$;
