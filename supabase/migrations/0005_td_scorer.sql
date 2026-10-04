-- TD Scorer.
--
-- No free source publishes anytime-TD prices, so point values are derived from
-- ESPN season production and may be overridden by an admin. Every value records
-- which of the two it was and what it was computed from, so a player can always
-- be shown why a number was what it was.

create type td_value_source as enum ('auto', 'manual');


-- Season production per player, refreshed from ESPN. Cache, not history: it is
-- freely overwritten, and nothing is graded against it.
create table public.player_season_stats (
  player_id uuid not null references public.nfl_players (id) on delete cascade,
  season integer not null,
  games_played integer not null default 0,
  rushing_touchdowns integer not null default 0,
  receiving_touchdowns integer not null default 0,
  total_touchdowns integer not null default 0,
  receptions integer not null default 0,
  rushing_attempts integer not null default 0,
  targets integer not null default 0,
  updated_at timestamptz not null default now(),

  primary key (player_id, season),
  constraint stats_nonneg check (
    games_played >= 0 and rushing_touchdowns >= 0 and receiving_touchdowns >= 0
    and total_touchdowns >= 0
  )
);

create trigger player_season_stats_touch before update on public.player_season_stats
  for each row execute function public.touch_updated_at();


-- Derive a point value from TD production.
--
-- A player scoring in a higher share of games is more likely to score again, so
-- is worth fewer points; a rare scorer is worth more. Shrunk toward the league
-- baseline so that one touchdown in one game does not read as a 100% rate —
-- without that, early-season and backup players produce absurd values.
--
-- Returns points to two decimals, bounded to [1, 30].
create or replace function public.derive_td_point_value(
  total_tds integer,
  games_played integer,
  prior_rate numeric default 0.18,
  prior_weight numeric default 4.0
)
returns numeric
language sql
immutable
as $$
  with rate as (
    select (coalesce(total_tds, 0) + prior_rate * prior_weight)
         / (greatest(coalesce(games_played, 0), 0) + prior_weight) as p
  )
  select round(
    least(greatest(1.0 / greatest((select p from rate), 0.02), 1), 30),
    2
  );
$$;


-- Candidate scorers for a week, built from the slate.
create table public.td_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.nfl_games (id) on delete cascade,
  player_id uuid not null references public.nfl_players (id) on delete cascade,
  season integer not null,
  week integer not null,
  team_abbr text not null references public.nfl_teams (abbr),
  opponent_abbr text not null references public.nfl_teams (abbr),
  position text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  unique (game_id, player_id)
);

create index td_players_week_idx on public.td_players (season, week) where is_active;


-- The point value a player is offered at, per league per week.
--
-- Frozen values are history and are sealed the same way contest lines are:
-- once frozen_at is set, only status may advance.
create table public.td_values (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  player_id uuid not null references public.nfl_players (id) on delete restrict,
  season integer not null,
  week integer not null,

  td_point_value numeric(6, 2) not null,
  source td_value_source not null default 'auto',

  -- What the auto value was computed from, kept for auditability. Null on a
  -- manual value that was never auto-derived.
  computed_total_tds integer,
  computed_games_played integer,

  -- Set only when an admin overrides.
  set_by_id uuid references public.profiles (user_id) on delete set null,
  set_at timestamptz,
  override_note text,

  frozen_at timestamptz,
  status contest_line_status not null default 'frozen',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (league_id, player_id, season, week),
  constraint td_values_positive check (td_point_value > 0),
  -- A manual value must say who set it; an auto value must not claim an author.
  constraint td_values_manual_attributed check (
    (source = 'manual' and set_by_id is not null and set_at is not null)
    or (source = 'auto' and set_by_id is null)
  )
);

create trigger td_values_touch before update on public.td_values
  for each row execute function public.touch_updated_at();

create index td_values_week_idx on public.td_values (league_id, season, week);


-- Once frozen, a TD value is what players were offered. An admin may still
-- correct it before the freeze; afterwards it is sealed.
create or replace function public.enforce_td_value_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.frozen_at is null then
    return new;
  end if;

  if new.td_point_value is distinct from old.td_point_value
     or new.player_id is distinct from old.player_id
     or new.league_id is distinct from old.league_id
     or new.season is distinct from old.season
     or new.week is distinct from old.week
     or new.source is distinct from old.source
     or new.frozen_at is distinct from old.frozen_at
  then
    raise exception
      'td value % is frozen and cannot be changed', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger td_values_immutable before update on public.td_values
  for each row execute function public.enforce_td_value_immutability();


create table public.td_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  league_id uuid not null references public.leagues (id) on delete cascade,
  challenge_id uuid not null references public.pickem_challenges (id) on delete restrict,
  season integer not null,
  week integer not null,

  player_id uuid not null references public.nfl_players (id) on delete restrict,
  game_id uuid not null references public.nfl_games (id) on delete restrict,
  team_abbr text references public.nfl_teams (abbr),
  opponent_abbr text references public.nfl_teams (abbr),
  position text,

  -- Snapshot of the value at submission, plus the row it came from.
  td_value_id uuid references public.td_values (id),
  td_point_value numeric(6, 2) not null,

  result pick_result not null default 'pending',
  points numeric(8, 2) not null default 0,
  graded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One TD pick per player per week; a user cannot stack the same player.
  unique (user_id, challenge_id, player_id),
  constraint td_picks_value_positive check (td_point_value > 0),
  constraint td_picks_points_nonneg check (points >= 0),
  constraint td_picks_graded_has_timestamp check (
    (result = 'pending' and graded_at is null) or (result <> 'pending' and graded_at is not null)
  )
);

create trigger td_picks_touch before update on public.td_picks
  for each row execute function public.touch_updated_at();

create index td_picks_user_week_idx on public.td_picks (user_id, season, week);
create index td_picks_challenge_idx on public.td_picks (challenge_id);

-- TD picks lock on the same Sunday kickoff as the Pick'em card. Grading still
-- writes result/points after the lock, so only the selection columns are sealed.
create or replace function public.enforce_td_pick_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lock_at timestamptz;
  target_challenge uuid;
  target_week integer;
begin
  target_challenge := case when tg_op = 'DELETE' then old.challenge_id else new.challenge_id end;
  target_week := case when tg_op = 'DELETE' then old.week else new.week end;

  select c.lock_time into lock_at
  from public.pickem_challenges c
  where c.id = target_challenge;

  if lock_at is null then
    raise exception 'td pick references a challenge that does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  if tg_op = 'DELETE' then
    if now() >= lock_at then
      raise exception 'td picks for week % are locked and cannot be deleted', target_week
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if now() >= lock_at then
      raise exception 'td picks for week % are locked', target_week
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if (new.player_id is distinct from old.player_id
      or new.td_point_value is distinct from old.td_point_value
      or new.td_value_id is distinct from old.td_value_id)
     and now() >= lock_at
  then
    raise exception 'td picks for week % are locked and cannot be changed', target_week
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger td_picks_enforce_lock before insert or update on public.td_picks
  for each row execute function public.enforce_td_pick_lock();

create trigger td_picks_enforce_delete_lock before delete on public.td_picks
  for each row execute function public.enforce_td_pick_lock();


-- Policies -------------------------------------------------------------------

alter table public.player_season_stats enable row level security;
alter table public.td_players enable row level security;
alter table public.td_values enable row level security;
alter table public.td_picks enable row level security;

create policy player_season_stats_read on public.player_season_stats
  for select using (auth.uid() is not null);

create policy td_players_read on public.td_players
  for select using (auth.uid() is not null);

create policy td_values_read on public.td_values
  for select using (public.is_league_member(league_id) or public.is_admin());

-- Overrides come from the commissioner or an admin, and only before the freeze
-- (the immutability trigger enforces the timing).
create policy td_values_write_commissioner on public.td_values
  for update using (public.is_league_commissioner(league_id) or public.is_admin())
  with check (public.is_league_commissioner(league_id) or public.is_admin());

create policy td_picks_read_own on public.td_picks
  for select using (user_id = auth.uid() or public.is_admin());

create policy td_picks_insert_own on public.td_picks
  for insert with check (user_id = auth.uid() and public.is_league_member(league_id));

create policy td_picks_update_own on public.td_picks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy td_picks_delete_own on public.td_picks
  for delete using (user_id = auth.uid());
