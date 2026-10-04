-- Foundation: extensions, enums, and shared helpers.

create extension if not exists pgcrypto;

-- Game status is a closed set with a one-way progression; see the
-- enforce_game_status_progression trigger in 0003.
create type game_status as enum ('scheduled', 'in_progress', 'final', 'postponed');

-- The three Pick'em markets. anytime_td is scored by the TD Scorer mode and is
-- never a Pick'em selection.
create type market_type as enum ('moneyline', 'spread', 'total', 'anytime_td');

create type pick_result as enum ('pending', 'win', 'loss', 'push');

create type contest_line_status as enum ('frozen', 'graded');

create type league_role as enum ('commissioner', 'member');

create type challenge_status as enum ('pending', 'accepted', 'declined', 'completed', 'cancelled', 'expired');

create type survivor_pick_result as enum ('pending', 'survived', 'eliminated', 'push');

create type pool_status as enum ('open', 'active', 'completed', 'cancelled');

create type sync_status as enum ('running', 'success', 'partial', 'failed');


-- Identity helpers -----------------------------------------------------------

-- Wraps auth.uid() so policies read the same way whether called from a user
-- session or a service-role job (where uid() is null).
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.user_id = auth.uid()),
    false
  );
$$;


-- updated_at maintenance -----------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- Odds conversion ------------------------------------------------------------

-- American odds to decimal. Kept in the database so grading, display, and any
-- backfill agree on one implementation.
create or replace function public.american_to_decimal(american numeric)
returns numeric
language sql
immutable
as $$
  select case
    when american is null then null
    when american >= 100 then round(1 + american / 100.0, 4)
    when american <= -100 then round(1 + 100.0 / abs(american), 4)
    else null
  end;
$$;
