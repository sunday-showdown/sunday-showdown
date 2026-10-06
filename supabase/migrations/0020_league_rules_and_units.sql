-- Commissioner rules, and a unit size for the bet tracker.
--
-- The lock rule is the one people argue about. Until now every league locked
-- every pick at the first kickoff of the week, which is the right default — it
-- stops anyone watching the early game before picking the late one. But plenty
-- of groups prefer each game locking at its own kickoff, so Sunday night can
-- still be picked on Sunday afternoon. Both are legitimate; which one is in
-- force is now the commissioner's call.
--
-- It is enforced in the trigger rather than in the API for the usual reason:
-- when a pick may be made is the single most abusable rule in the app, and
-- application code can be bypassed.

-- What a unit is worth to somebody, for lib/betStats.ts ------------------------

alter table public.profiles
  add column if not exists unit_size numeric(10, 2) not null default 10;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_unit_size_positive') then
    alter table public.profiles
      add constraint profiles_unit_size_positive check (unit_size > 0 and unit_size <= 1000000);
  end if;
end
$$;

-- Column grants, same reasoning as migration 0009: this is a field that is
-- genuinely the user's, so it joins the list rather than widening it.
grant update (unit_size) on public.profiles to authenticated;

-- League rules ----------------------------------------------------------------

alter table public.leagues
  add column if not exists lock_policy text not null default 'first_kickoff';

alter table public.leagues
  add column if not exists default_markets market_type[] not null
  default array['moneyline', 'spread', 'total']::market_type[];

alter table public.leagues
  add column if not exists allow_late_join boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leagues_lock_policy_valid') then
    alter table public.leagues
      add constraint leagues_lock_policy_valid
      check (lock_policy in ('first_kickoff', 'per_game'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leagues_markets_not_empty') then
    alter table public.leagues
      add constraint leagues_markets_not_empty
      check (
        cardinality(default_markets) > 0
        and not ('anytime_td' = any (default_markets))
      );
  end if;
end
$$;

-- A commissioner may set the rules. They may not rewrite the league's identity
-- or its counters, which is what a row-level policy alone would have allowed.
revoke update on public.leagues from authenticated;

grant update (
  name,
  avatar_url,
  lock_policy,
  default_markets,
  allow_late_join,
  settings,
  updated_at
) on public.leagues to authenticated;

-- The lock ---------------------------------------------------------------------

/**
 * When a given pick stops being changeable.
 *
 * Under the default rule that is the contest's lock time, computed once from
 * the first kickoff of the week. Under the per-game rule it is that game's own
 * kickoff. Returning one timestamp from one place keeps the insert path, the
 * update path and the delete path from ever disagreeing about it.
 */
create or replace function public.pick_lock_time(target_challenge uuid, target_game uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  contest_lock timestamptz;
  policy text;
  kickoff timestamptz;
begin
  select c.lock_time, l.lock_policy into contest_lock, policy
  from public.pickem_challenges c
  join public.leagues l on l.id = c.league_id
  where c.id = target_challenge;

  if contest_lock is null then
    return null;
  end if;

  if policy <> 'per_game' then
    return contest_lock;
  end if;

  select g.start_time into kickoff
  from public.nfl_games g
  where g.id = target_game;

  -- A pick on a game that has gone missing falls back to the contest lock
  -- rather than to "never locks".
  return coalesce(kickoff, contest_lock);
end;
$$;

create or replace function public.enforce_pick_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lock_at timestamptz;
begin
  lock_at := public.pick_lock_time(new.challenge_id, new.game_id);

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

create or replace function public.enforce_pick_delete_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lock_at timestamptz;
begin
  lock_at := public.pick_lock_time(old.challenge_id, old.game_id);

  if lock_at is not null and now() >= lock_at then
    raise exception 'picks for week % are locked and cannot be removed', old.week
      using errcode = 'check_violation';
  end if;

  return old;
end;
$$;
