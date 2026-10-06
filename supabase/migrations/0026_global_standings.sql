-- One table for everybody.
--
-- Ranks only ever showed the league you were looking at, which makes the app
-- feel smaller than it is: in a group where everyone knows everyone, the
-- interesting question is often who is best overall, not who is best in this
-- particular group of six.
--
-- It needs a function rather than a query because weekly_results is readable
-- only by members of its league (migration 0004), which is correct — your card
-- is not public — and also makes a cross-league total impossible from the
-- client. This returns aggregates and nothing else: a name, an avatar and some
-- season totals. No per-league detail, no per-pick detail, nothing that a
-- league's own standings would not already show its members.
--
-- THE RULE: one score per person per week.
--
-- Somebody in three leagues has three rows for week five, all for the same
-- card, so summing weekly_results outright would rank people by how many
-- leagues they joined. The best of a person's rows for a week is taken as their
-- score for that week, and those are what add up. Markets and frozen lines do
-- differ slightly between leagues, so "best" is a real choice rather than a
-- tie-break — it is the generous one, and the same one for everybody.

create or replace function public.global_standings(target_season integer)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  total_points numeric,
  td_points numeric,
  weeks_played integer,
  weekly_wins integer,
  best_week numeric,
  correct_ml integer,
  correct_spread integer,
  correct_totals integer,
  current_streak integer,
  longest_streak integer
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    -- One row per person per week: the league they did best in that week.
    -- league_id breaks the tie so the choice is stable across calls rather
    -- than depending on the order the planner happened to return rows in.
    select distinct on (wr.user_id, wr.week)
      wr.user_id,
      wr.week,
      wr.total_points,
      wr.td_points,
      wr.is_winner,
      wr.correct_ml,
      wr.correct_spread,
      wr.correct_totals
    from public.weekly_results wr
    where wr.season = target_season
    order by wr.user_id, wr.week, wr.total_points desc, wr.league_id
  )
  select
    p.user_id,
    p.username,
    p.avatar_url,
    coalesce(sum(b.total_points), 0)::numeric,
    coalesce(sum(b.td_points), 0)::numeric,
    count(b.week)::integer,
    count(*) filter (where b.is_winner)::integer,
    coalesce(max(b.total_points), 0)::numeric,
    coalesce(sum(b.correct_ml), 0)::integer,
    coalesce(sum(b.correct_spread), 0)::integer,
    coalesce(sum(b.correct_totals), 0)::integer,
    coalesce(p.current_pickem_streak, 0),
    coalesce(p.longest_pickem_streak, 0)
  from best b
  join public.profiles p on p.user_id = b.user_id
  group by p.user_id, p.username, p.avatar_url,
           p.current_pickem_streak, p.longest_pickem_streak;
$$;

revoke all on function public.global_standings(integer) from public;
grant execute on function public.global_standings(integer) to authenticated;
