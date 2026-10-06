-- member_count counts itself.
--
-- Migration 0020 revoked table-wide update on leagues and granted only the
-- columns a commissioner may set, which is right — but member_count was being
-- maintained by the API with the signed-in user's own client, so removing a
-- member would have started failing on permissions.
--
-- Adding member_count back to the grant would have let a commissioner type any
-- number into it. Counting from the membership table is better than either:
-- the number cannot drift, two people joining at once cannot both read the same
-- total and write it back, and nothing in the application has to remember.

create or replace function public.recount_league_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.league_id, old.league_id);
begin
  update public.leagues l
  set member_count = (
    select count(*) from public.league_members m where m.league_id = target
  )
  where l.id = target;

  return coalesce(new, old);
end;
$$;

drop trigger if exists league_members_recount on public.league_members;
create trigger league_members_recount
  after insert or delete on public.league_members
  for each row execute function public.recount_league_members();

-- Correct anything that drifted before the trigger existed.
update public.leagues l
set member_count = (select count(*) from public.league_members m where m.league_id = l.id);
