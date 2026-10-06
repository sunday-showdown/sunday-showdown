-- Duels: head to head against anyone, for a week or for the season.
--
-- Head to head was built as a league feature — league_id was NOT NULL and the
-- insert policy demanded membership — which had the shape backwards. A league
-- is a convenient group to spin competitions up inside, not the boundary of who
-- you are allowed to fight. You should be able to call out any friend.
--
-- Three things that needs.
--
-- league_id becomes optional, with a new is_friend() guard so a duel outside a
-- league still cannot be aimed at a stranger. Mutual follows only: a one-way
-- follow is not consent to be challenged.
--
-- Scoring has to say whose card counts. Inside a league both players share a
-- slate and a frozen set of lines, so one league_id answered it. Across leagues
-- it does not, so each side now records the league its card is read from —
-- challenger_league_id at creation, opponent_league_id when the challenge is
-- accepted. Grading reads those two columns and never has to guess.
--
-- And a season duel is many weeks, so h2h_rounds stores one row per week. The
-- running fight is replayed from those rows (lib/battle.ts) rather than kept as
-- a mutable total, so a week re-graded for a corrected score corrects the fight
-- instead of double-counting it.

-- Who you may challenge --------------------------------------------------------

-- Mutual follows, as a SECURITY DEFINER function for the same reason every
-- other membership check is one: it is called from a policy, and a policy that
-- reads a table with its own policies is how 0018 deadlocked.
create or replace function public.is_friend(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.follows f
    where f.follower_id = auth.uid() and f.following_id = other_user
  ) and exists (
    select 1 from public.follows f
    where f.follower_id = other_user and f.following_id = auth.uid()
  );
$$;

revoke all on function public.is_friend(uuid) from public;
grant execute on function public.is_friend(uuid) to authenticated;


-- Duels -----------------------------------------------------------------------

alter table public.h2h_challenges
  alter column league_id drop not null;

alter table public.h2h_challenges
  add column if not exists duration text not null default 'week',
  add column if not exists challenger_league_id uuid references public.leagues (id) on delete set null,
  add column if not exists opponent_league_id uuid references public.leagues (id) on delete set null,
  add column if not exists challenger_damage numeric(6, 1) not null default 0,
  add column if not exists opponent_damage numeric(6, 1) not null default 0,
  -- When the opponent first saw the challenge, so the arena animation plays
  -- once rather than every time they open the screen.
  add column if not exists seen_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'h2h_duration_valid') then
    alter table public.h2h_challenges
      add constraint h2h_duration_valid check (duration in ('week', 'season'));
  end if;
end
$$;

-- Existing rows were all league duels, so both sides read from that league.
update public.h2h_challenges
   set challenger_league_id = coalesce(challenger_league_id, league_id),
       opponent_league_id = coalesce(opponent_league_id, league_id)
 where league_id is not null
   and (challenger_league_id is null or opponent_league_id is null);

-- The original unique constraint includes league_id, and NULLs do not collide
-- in a unique constraint, so a friend duel outside a league was unprotected
-- from the double-tap the constraint exists to stop. This covers that case.
create unique index if not exists h2h_one_friend_duel_per_week
  on public.h2h_challenges (challenger_id, opponent_id, season, week, challenge_type)
  where league_id is null;

-- A season duel is one long fight, so a pair may only have one open at a time —
-- in either direction, hence least/greatest rather than the column pair.
create unique index if not exists h2h_one_open_season_duel
  on public.h2h_challenges (
    least(challenger_id, opponent_id),
    greatest(challenger_id, opponent_id),
    season
  )
  where duration = 'season' and status in ('pending', 'accepted');

create index if not exists h2h_challenges_duration_idx
  on public.h2h_challenges (season, duration, status);


-- A duel outside a league is readable by its two parties; inside one, by the
-- league as well. Spelled with an explicit null check because is_league_member
-- returns false for a null argument and relying on that is the kind of thing a
-- later refactor quietly breaks.
drop policy if exists h2h_challenges_read on public.h2h_challenges;
create policy h2h_challenges_read on public.h2h_challenges
  for select using (
    challenger_id = auth.uid()
    or opponent_id = auth.uid()
    or (league_id is not null and public.is_league_member(league_id))
    or public.is_admin()
  );

-- You may challenge a league mate, or a friend. Not a stranger whose id you
-- happen to have.
drop policy if exists h2h_challenges_insert on public.h2h_challenges;
create policy h2h_challenges_insert on public.h2h_challenges
  for insert with check (
    challenger_id = auth.uid()
    and (
      (league_id is not null and public.is_league_member(league_id))
      or (league_id is null and public.is_friend(opponent_id))
    )
  );

-- Scores, damage and the winner are grading's to write, so neither party may
-- touch them from the client. Everything the two of them legitimately change —
-- answering, withdrawing, marking a challenge seen — is in this list.
revoke update on public.h2h_challenges from authenticated;
grant update (status, accepted_at, cancelled_at, seen_at, opponent_league_id)
  on public.h2h_challenges to authenticated;


-- Rounds ----------------------------------------------------------------------

create table if not exists public.h2h_rounds (
  challenge_id uuid not null references public.h2h_challenges (id) on delete cascade,
  week integer not null,
  challenger_points numeric(8, 2) not null default 0,
  opponent_points numeric(8, 2) not null default 0,
  challenger_damage numeric(6, 1) not null default 0,
  opponent_damage numeric(6, 1) not null default 0,
  graded_at timestamptz not null default now(),

  primary key (challenge_id, week),
  constraint h2h_rounds_damage_nonneg check (challenger_damage >= 0 and opponent_damage >= 0)
);

alter table public.h2h_rounds enable row level security;

-- Readable by the two fighters and by the league the duel belongs to; written
-- only by grading, which runs as the service role and bypasses RLS. There is
-- deliberately no write policy here.
drop policy if exists h2h_rounds_read on public.h2h_rounds;
create policy h2h_rounds_read on public.h2h_rounds
  for select using (
    exists (
      select 1 from public.h2h_challenges c
      where c.id = h2h_rounds.challenge_id
        and (
          c.challenger_id = auth.uid()
          or c.opponent_id = auth.uid()
          or (c.league_id is not null and public.is_league_member(c.league_id))
        )
    )
    or public.is_admin()
  );


-- Fighters --------------------------------------------------------------------

-- Cosmetic only. See lib/fighters.ts: an archetype that changed the maths would
-- make a duel about reading a stat table rather than about picking well, so
-- there are no stats here to read — a silhouette, a colour and a taunt.
create table if not exists public.fighters (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  name text not null,
  archetype text not null default 'brawler',
  banner text not null default 'crimson',
  taunt text,

  -- Duel record, maintained by grading alongside h2h_records.
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fighters_name_len check (char_length(name) between 2 and 18),
  constraint fighters_taunt_len check (taunt is null or char_length(taunt) <= 80),
  constraint fighters_record_nonneg check (wins >= 0 and losses >= 0 and draws >= 0)
);

drop trigger if exists fighters_touch on public.fighters;
create trigger fighters_touch before update on public.fighters
  for each row execute function public.touch_updated_at();

alter table public.fighters enable row level security;

-- Anyone signed in may look at a fighter: you are about to be hit by one.
drop policy if exists fighters_read on public.fighters;
create policy fighters_read on public.fighters
  for select using (auth.uid() is not null);

drop policy if exists fighters_write_own on public.fighters;
create policy fighters_write_own on public.fighters
  for insert with check (user_id = auth.uid());

drop policy if exists fighters_update_own on public.fighters;
create policy fighters_update_own on public.fighters
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The record belongs to grading, not to the fighter's owner.
revoke update on public.fighters from authenticated;
grant update (name, archetype, banner, taunt) on public.fighters to authenticated;
