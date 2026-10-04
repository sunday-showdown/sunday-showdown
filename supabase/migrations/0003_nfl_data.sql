-- NFL reference data, games, and odds.
--
-- Everything here is written only by the ESPN sync jobs running under the
-- service role. Clients read; clients never write.

create table public.nfl_teams (
  abbr text primary key,
  espn_id text unique,
  name text not null,
  city text,
  display_name text,
  logo text,
  color text,
  alt_color text,
  conference text,
  division text,
  updated_at timestamptz not null default now()
);

create trigger nfl_teams_touch before update on public.nfl_teams
  for each row execute function public.touch_updated_at();


create table public.nfl_seasons (
  season integer primary key,
  season_type integer not null default 2,
  start_date date,
  end_date date,
  current_week integer,
  status text,
  updated_at timestamptz not null default now()
);


create table public.nfl_weeks (
  season integer not null references public.nfl_seasons (season) on delete cascade,
  week_number integer not null,
  season_type integer not null default 2,
  start_date date,
  end_date date,
  -- First Sunday kickoff of the week. The weekly pick lock derives from this,
  -- so a Thursday game does not lock the card.
  first_sunday_kickoff timestamptz,
  status text,
  updated_at timestamptz not null default now(),

  primary key (season, week_number, season_type),
  constraint nfl_weeks_week_range check (week_number between 1 and 22)
);


create table public.nfl_games (
  id uuid primary key default gen_random_uuid(),
  -- ESPN's event id. The natural key for every sync; a unique constraint here
  -- is what makes repeated syncs idempotent instead of creating duplicates.
  espn_id text not null unique,
  season integer not null,
  week integer not null,
  season_type integer not null default 2,

  home_abbr text not null references public.nfl_teams (abbr),
  away_abbr text not null references public.nfl_teams (abbr),
  home_team text,
  away_team text,
  home_logo text,
  away_logo text,
  home_color text,
  away_color text,

  start_time timestamptz not null,
  status game_status not null default 'scheduled',
  status_detail text,
  home_score integer,
  away_score integer,
  completed_at timestamptz,
  last_synced timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint nfl_games_week_range check (week between 1 and 22),
  constraint nfl_games_distinct_teams check (home_abbr <> away_abbr),
  constraint nfl_games_scores_nonneg check (
    (home_score is null or home_score >= 0) and (away_score is null or away_score >= 0)
  ),
  -- A final game must have a score, or grading has nothing to grade against.
  constraint nfl_games_final_has_scores check (
    status <> 'final' or (home_score is not null and away_score is not null)
  )
);

create trigger nfl_games_touch before update on public.nfl_games
  for each row execute function public.touch_updated_at();

create index nfl_games_week_idx on public.nfl_games (season, week, start_time);
create index nfl_games_status_idx on public.nfl_games (status) where status <> 'final';


-- Status may only move forward.
--
-- Valid:   scheduled -> in_progress, scheduled -> final,
--          in_progress -> final, final -> final (score correction)
-- Blocked: final -> scheduled, final -> in_progress, in_progress -> scheduled
--
-- A flaky provider response that reports a completed game as scheduled would
-- otherwise un-grade it and wipe the week's results, so this is enforced here
-- rather than trusted to sync code.
create or replace function public.enforce_game_status_progression()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'final' then
    raise exception
      'game % status cannot regress from final to %', old.espn_id, new.status
      using errcode = 'check_violation';
  end if;

  if old.status = 'in_progress' and new.status = 'scheduled' then
    raise exception
      'game % status cannot regress from in_progress to scheduled', old.espn_id
      using errcode = 'check_violation';
  end if;

  if new.status = 'final' and new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

create trigger nfl_games_status_progression before update of status on public.nfl_games
  for each row execute function public.enforce_game_status_progression();


-- Live odds, as pulled from ESPN. Superseded rows are kept (is_active = false)
-- so a line's history is auditable; frozen contest lines live in their own
-- table and are never read from here.
create table public.nfl_game_odds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.nfl_games (id) on delete cascade,
  season integer not null,
  week integer not null,
  market_type market_type not null,

  -- 'home' | 'away' for moneyline and spread; 'over' | 'under' for total.
  selection text not null,
  team_abbr text references public.nfl_teams (abbr),
  line numeric(5, 1),
  american_odds integer,
  decimal_odds numeric(8, 4),

  provider text not null,
  captured_at timestamptz not null default now(),
  is_active boolean not null default true,
  superseded_at timestamptz,

  created_at timestamptz not null default now(),

  constraint game_odds_selection_valid check (
    (market_type in ('moneyline', 'spread') and selection in ('home', 'away'))
    or (market_type = 'total' and selection in ('over', 'under'))
    or market_type = 'anytime_td'
  ),
  -- Spread and total are meaningless without a number.
  constraint game_odds_line_required check (
    market_type = 'moneyline' or line is not null
  )
);

create unique index game_odds_one_active_per_selection
  on public.nfl_game_odds (game_id, market_type, selection)
  where is_active;

create index game_odds_week_idx on public.nfl_game_odds (season, week) where is_active;
create index game_odds_game_idx on public.nfl_game_odds (game_id) where is_active;


create table public.nfl_players (
  id uuid primary key default gen_random_uuid(),
  espn_id text not null unique,
  name text not null,
  normalized_name text not null,
  team_abbr text references public.nfl_teams (abbr),
  position text,
  status text,
  jersey_number text,
  headshot_url text,
  season integer,
  last_synced timestamptz,
  updated_at timestamptz not null default now()
);

create index nfl_players_team_idx on public.nfl_players (team_abbr);
create index nfl_players_normalized_idx on public.nfl_players (normalized_name);


create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null,
  provider_name text,
  status sync_status not null,
  season integer,
  week integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  games_processed integer not null default 0,
  odds_processed integer not null default 0,
  players_processed integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb
);

create index sync_logs_recent_idx on public.sync_logs (sync_type, started_at desc);


-- Reference data is world-readable to any signed-in user; writes are
-- service-role only, which bypasses RLS.
alter table public.nfl_teams enable row level security;
alter table public.nfl_seasons enable row level security;
alter table public.nfl_weeks enable row level security;
alter table public.nfl_games enable row level security;
alter table public.nfl_game_odds enable row level security;
alter table public.nfl_players enable row level security;
alter table public.sync_logs enable row level security;

create policy nfl_teams_read on public.nfl_teams for select using (auth.uid() is not null);
create policy nfl_seasons_read on public.nfl_seasons for select using (auth.uid() is not null);
create policy nfl_weeks_read on public.nfl_weeks for select using (auth.uid() is not null);
create policy nfl_games_read on public.nfl_games for select using (auth.uid() is not null);
create policy nfl_game_odds_read on public.nfl_game_odds for select using (auth.uid() is not null);
create policy nfl_players_read on public.nfl_players for select using (auth.uid() is not null);
create policy sync_logs_read_admin on public.sync_logs for select using (public.is_admin());
