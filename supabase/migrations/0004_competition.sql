-- Pick'em contests, frozen lines, picks, and weekly results.

create table public.pickem_challenges (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season integer not null,
  week integer not null,
  -- Which of the three markets the commissioner opened this week.
  enabled_markets market_type[] not null default array['moneyline','spread','total']::market_type[],
  -- First Sunday kickoff. Copied from nfl_weeks at creation so a later
  -- schedule change cannot retroactively move a lock that already passed.
  lock_time timestamptz not null,
  locked_at timestamptz,
  lines_frozen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (league_id, season, week),
  constraint challenges_markets_not_empty check (cardinality(enabled_markets) > 0),
  constraint challenges_no_td_market check (not ('anytime_td' = any (enabled_markets)))
);

create trigger pickem_challenges_touch before update on public.pickem_challenges
  for each row execute function public.touch_updated_at();

create index pickem_challenges_league_idx on public.pickem_challenges (league_id, season, week);


-- Frozen historical lines. Immutable by trigger: these are the record of what
-- each player was actually offered, and grading reads only from here.
create table public.contest_lines (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.pickem_challenges (id) on delete restrict,
  league_id uuid not null references public.leagues (id) on delete restrict,
  game_id uuid not null references public.nfl_games (id) on delete restrict,
  season integer not null,
  week integer not null,

  market_type market_type not null,
  selection text not null,
  contest_line numeric(5, 1),
  contest_odds integer,
  td_point_value numeric(6, 2),
  player_id uuid references public.nfl_players (id),
  player_name text,

  provider text not null,
  captured_at timestamptz not null,
  frozen_at timestamptz not null default now(),
  status contest_line_status not null default 'frozen',
  version integer not null default 1,

  unique (challenge_id, game_id, market_type, selection, version),
  constraint contest_lines_line_required check (
    market_type in ('moneyline', 'anytime_td') or contest_line is not null
  )
);

create index contest_lines_challenge_idx on public.contest_lines (challenge_id);
create index contest_lines_game_idx on public.contest_lines (game_id, market_type);


-- A frozen line is history. Only its status may advance (frozen -> graded);
-- every other column is sealed, and rows are never deleted. Without this, a
-- re-run of the freeze job or a stray sync could silently rewrite what a
-- player was offered after they had already been graded against it.
create or replace function public.enforce_contest_line_immutability()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'contest lines are historical records and cannot be deleted'
      using errcode = 'check_violation';
  end if;

  if new.challenge_id is distinct from old.challenge_id
     or new.league_id is distinct from old.league_id
     or new.game_id is distinct from old.game_id
     or new.season is distinct from old.season
     or new.week is distinct from old.week
     or new.market_type is distinct from old.market_type
     or new.selection is distinct from old.selection
     or new.contest_line is distinct from old.contest_line
     or new.contest_odds is distinct from old.contest_odds
     or new.td_point_value is distinct from old.td_point_value
     or new.player_id is distinct from old.player_id
     or new.provider is distinct from old.provider
     or new.captured_at is distinct from old.captured_at
     or new.frozen_at is distinct from old.frozen_at
     or new.version is distinct from old.version
  then
    raise exception
      'frozen contest line % is immutable; only status may change', old.id
      using errcode = 'check_violation';
  end if;

  if old.status = 'graded' and new.status <> 'graded' then
    raise exception 'contest line % cannot regress from graded', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger contest_lines_immutable_update before update on public.contest_lines
  for each row execute function public.enforce_contest_line_immutability();

create trigger contest_lines_immutable_delete before delete on public.contest_lines
  for each row execute function public.enforce_contest_line_immutability();


create table public.picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  league_id uuid not null references public.leagues (id) on delete cascade,
  challenge_id uuid not null references public.pickem_challenges (id) on delete restrict,
  game_id uuid not null references public.nfl_games (id) on delete restrict,
  season integer not null,
  week integer not null,

  market_type market_type not null,
  selection text not null,
  selection_label text,

  -- Snapshot of the line and price at submission. Grading reads these, never
  -- live odds, so a line move after submission cannot change a settled pick.
  contest_line numeric(5, 1),
  contest_odds integer,
  contest_line_id uuid references public.contest_lines (id),

  result pick_result not null default 'pending',
  points numeric(6, 2) not null default 0,
  graded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One market per game, mutually exclusive, exactly one active pick per
  -- user + contest + game. Structural, not advisory.
  unique (user_id, challenge_id, game_id),

  constraint picks_market_is_pickem check (market_type in ('moneyline', 'spread', 'total')),
  constraint picks_selection_valid check (
    (market_type in ('moneyline', 'spread') and selection in ('home', 'away'))
    or (market_type = 'total' and selection in ('over', 'under'))
  ),
  constraint picks_line_required check (
    market_type = 'moneyline' or contest_line is not null
  ),
  constraint picks_points_nonneg check (points >= 0),
  constraint picks_graded_has_timestamp check (
    (result = 'pending' and graded_at is null) or (result <> 'pending' and graded_at is not null)
  )
);

create trigger picks_touch before update on public.picks
  for each row execute function public.touch_updated_at();

create index picks_user_week_idx on public.picks (user_id, season, week);
create index picks_challenge_idx on public.picks (challenge_id);
create index picks_game_idx on public.picks (game_id) where result = 'pending';


-- Lock enforcement, in the database.
--
-- After a contest's lock_time no pick may be created, and no existing pick may
-- change its market or selection. Grading still writes result/points/graded_at
-- after the lock, which is why this checks the specific columns rather than
-- rejecting all writes.
create or replace function public.enforce_pick_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lock_at timestamptz;
begin
  select c.lock_time into lock_at
  from public.pickem_challenges c
  where c.id = new.challenge_id;

  if lock_at is null then
    raise exception 'pick references a challenge that does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  if tg_op = 'INSERT' then
    if now() >= lock_at then
      raise exception 'picks for week % are locked', new.week
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if (new.market_type is distinct from old.market_type
      or new.selection is distinct from old.selection
      or new.contest_line is distinct from old.contest_line
      or new.contest_odds is distinct from old.contest_odds)
     and now() >= lock_at
  then
    raise exception 'picks for week % are locked and cannot be changed', old.week
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger picks_enforce_lock before insert or update on public.picks
  for each row execute function public.enforce_pick_lock();


-- Deleting a locked pick would be a way to escape a loss, so the lock covers
-- deletes too. Before the lock, clearing a pick is a normal edit.
create or replace function public.enforce_pick_delete_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lock_at timestamptz;
begin
  select c.lock_time into lock_at
  from public.pickem_challenges c
  where c.id = old.challenge_id;

  if lock_at is not null and now() >= lock_at then
    raise exception 'picks for week % are locked and cannot be deleted', old.week
      using errcode = 'check_violation';
  end if;

  return old;
end;
$$;

create trigger picks_enforce_delete_lock before delete on public.picks
  for each row execute function public.enforce_pick_delete_lock();


create table public.weekly_results (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  season integer not null,
  week integer not null,

  pickem_points numeric(8, 2) not null default 0,
  td_points numeric(8, 2) not null default 0,
  total_points numeric(8, 2) not null default 0,
  correct_ml integer not null default 0,
  correct_spread integer not null default 0,
  correct_totals integer not null default 0,
  rank integer,
  is_winner boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (league_id, user_id, season, week),
  constraint weekly_results_rank_positive check (rank is null or rank > 0)
);

create trigger weekly_results_touch before update on public.weekly_results
  for each row execute function public.touch_updated_at();

create index weekly_results_standings_idx on public.weekly_results (league_id, season, week, rank);


-- Policies -------------------------------------------------------------------

alter table public.pickem_challenges enable row level security;
alter table public.contest_lines enable row level security;
alter table public.picks enable row level security;
alter table public.weekly_results enable row level security;

create policy pickem_challenges_read on public.pickem_challenges
  for select using (public.is_league_member(league_id) or public.is_admin());

create policy pickem_challenges_write_commissioner on public.pickem_challenges
  for all using (public.is_league_commissioner(league_id))
  with check (public.is_league_commissioner(league_id));

-- Frozen lines are visible to the whole league: everyone needs to see what was
-- offered. Writes are service-role only (the freeze job).
create policy contest_lines_read on public.contest_lines
  for select using (public.is_league_member(league_id) or public.is_admin());

-- Your own picks are yours. Other players' picks become visible after the lock
-- via the league-picks route, which filters server-side; the table itself never
-- exposes a pending pick to an opponent.
create policy picks_read_own on public.picks
  for select using (user_id = auth.uid() or public.is_admin());

create policy picks_insert_own on public.picks
  for insert with check (user_id = auth.uid() and public.is_league_member(league_id));

create policy picks_update_own on public.picks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy picks_delete_own on public.picks
  for delete using (user_id = auth.uid());

create policy weekly_results_read on public.weekly_results
  for select using (public.is_league_member(league_id) or public.is_admin());
