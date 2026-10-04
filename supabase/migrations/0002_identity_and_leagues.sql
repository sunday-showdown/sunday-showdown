-- Profiles, leagues, membership, and invites.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text,
  avatar_url text,
  bio text,
  favorite_team text,
  is_admin boolean not null default false,

  career_pickem_wins integer not null default 0,
  career_pickem_losses integer not null default 0,
  career_pickem_pushes integer not null default 0,
  career_ml_wins integer not null default 0,
  career_ml_losses integer not null default 0,
  career_spread_wins integer not null default 0,
  career_spread_losses integer not null default 0,
  career_total_wins integer not null default 0,
  career_total_losses integer not null default 0,
  career_td_scores integer not null default 0,

  survivor_pools_entered integer not null default 0,
  survivor_pools_won integer not null default 0,
  survivor_weeks_survived integer not null default 0,

  weekly_wins_count integer not null default 0,
  season_wins_count integer not null default 0,

  current_pickem_streak integer not null default 0,
  longest_pickem_streak integer not null default 0,
  current_participation_streak integer not null default 0,
  longest_participation_streak integer not null default 0,
  current_td_streak integer not null default 0,
  longest_td_streak integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,24}$')
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();


-- Defined here rather than in 0001 because it reads profiles, and a
-- `language sql` body is validated against the catalogue when it is created.
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


alter table public.profiles enable row level security;

-- Profiles are league-visible by design: standings, activity feeds and H2H all
-- show other players' names.
create policy profiles_read on public.profiles
  for select using (auth.uid() is not null);

create policy profiles_insert_self on public.profiles
  for insert with check (user_id = auth.uid());

create policy profiles_update_self on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Career stats are written by grading under the service role, which bypasses
-- RLS. No client-side delete path.


create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,
  commissioner_id uuid not null references public.profiles (user_id) on delete restrict,
  invite_code text not null unique,
  season integer not null,
  current_week integer not null default 1,
  settings jsonb not null default '{}'::jsonb,
  member_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leagues_name_len check (char_length(name) between 3 and 48),
  constraint leagues_week_range check (current_week between 1 and 22),
  constraint leagues_invite_code_format check (invite_code ~ '^[A-Z0-9]{6,10}$')
);

create trigger leagues_touch before update on public.leagues
  for each row execute function public.touch_updated_at();

create index leagues_commissioner_idx on public.leagues (commissioner_id);
create index leagues_season_idx on public.leagues (season);


create table public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  role league_role not null default 'member',
  joined_at timestamptz not null default now(),

  unique (league_id, user_id)
);

create index league_members_user_idx on public.league_members (user_id);
create index league_members_league_idx on public.league_members (league_id);


-- Membership test used by most policies below. SECURITY DEFINER so that
-- checking membership does not itself require a policy on league_members,
-- which would recurse.
create or replace function public.is_league_member(target_league uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = target_league and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_league_commissioner(target_league uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leagues l
    where l.id = target_league and l.commissioner_id = auth.uid()
  );
$$;


alter table public.leagues enable row level security;

create policy leagues_read_member on public.leagues
  for select using (public.is_league_member(id) or public.is_admin());

create policy leagues_insert on public.leagues
  for insert with check (commissioner_id = auth.uid());

create policy leagues_update_commissioner on public.leagues
  for update using (commissioner_id = auth.uid() or public.is_admin())
  with check (commissioner_id = auth.uid() or public.is_admin());


alter table public.league_members enable row level security;

create policy league_members_read on public.league_members
  for select using (public.is_league_member(league_id) or public.is_admin());

-- Joining is done through a backend route that validates the invite code; this
-- policy only permits adding yourself, never someone else.
create policy league_members_insert_self on public.league_members
  for insert with check (user_id = auth.uid());

create policy league_members_delete on public.league_members
  for delete using (user_id = auth.uid() or public.is_league_commissioner(league_id));


create table public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  invite_code text not null unique,
  created_by_id uuid not null references public.profiles (user_id) on delete cascade,
  max_uses integer,
  uses_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),

  constraint invites_uses_nonneg check (uses_count >= 0),
  constraint invites_max_uses_positive check (max_uses is null or max_uses > 0)
);

create index league_invites_league_idx on public.league_invites (league_id);

alter table public.league_invites enable row level security;

create policy league_invites_read on public.league_invites
  for select using (public.is_league_member(league_id) or public.is_admin());

create policy league_invites_write_commissioner on public.league_invites
  for all using (public.is_league_commissioner(league_id))
  with check (public.is_league_commissioner(league_id));
