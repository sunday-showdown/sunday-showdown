-- Stop a user rewriting their own privileges and record.
--
-- profiles_update_self lets a user update their own row, and RLS policies apply
-- to rows, not columns. That meant a signed-in user could PATCH
-- is_admin = true onto themselves and immediately satisfy every is_admin()
-- check in the schema, or inflate their own career record and streaks.
--
-- Column-level grants are the fix: the user keeps the fields that are genuinely
-- theirs to edit, and everything grading owns becomes server-only. Revoking
-- from `authenticated` leaves the service role (which grading runs as)
-- untouched.

revoke update on public.profiles from authenticated;

grant update (
  username,
  full_name,
  avatar_url,
  bio,
  favorite_team
) on public.profiles to authenticated;


-- Leagues track which week they are on, and nothing was advancing it: a league
-- created in week 1 would show week 1 forever. The contest cron now sets it,
-- but the column should never be moved backwards by a stale job.
create or replace function public.enforce_league_week_forward()
returns trigger
language plpgsql
as $$
begin
  if new.current_week < old.current_week then
    raise exception
      'league % current_week cannot move backwards (% -> %)',
      old.id, old.current_week, new.current_week
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger leagues_week_forward before update of current_week on public.leagues
  for each row execute function public.enforce_league_week_forward();


-- Commissioners may change league settings, but not reassign the league to
-- someone else or rewrite its invite code out from under its members.
create or replace function public.protect_league_identity()
returns trigger
language plpgsql
as $$
begin
  if new.commissioner_id is distinct from old.commissioner_id
     and not public.is_admin()
  then
    raise exception 'a league cannot be handed to another commissioner here'
      using errcode = 'check_violation';
  end if;

  if new.season is distinct from old.season then
    raise exception 'a league cannot change season'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger leagues_protect_identity before update on public.leagues
  for each row execute function public.protect_league_identity();
