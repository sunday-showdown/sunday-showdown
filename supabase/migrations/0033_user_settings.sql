-- Settings a person can actually change.
--
-- Three gaps. A username was fixed at signup with no way to change it. The
-- books somebody actually bets with were not recorded anywhere, so the slip
-- composer offered all eleven every time including the eight they have never
-- opened. And the per-type notification switches existed as columns from the
-- start (migration 0006) with nothing in the app to set them.
--
-- Only the first two need schema. Both go on profiles, which is already the
-- table with a deliberately narrow column grant: everything a person may change
-- about themselves is in that list, and anything not in it they cannot touch
-- however they talk to the database.

alter table public.profiles
  add column if not exists preferred_books text[];

-- A username is already unique and length-checked; this adds the one rule the
-- UI assumed and never enforced, so a rename cannot produce a name that signup
-- would have refused.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_shape') then
    alter table public.profiles
      add constraint profiles_username_shape
      check (username ~ '^[A-Za-z0-9_.]{3,20}$');
  end if;
end
$$;

grant update (preferred_books) on public.profiles to authenticated;

-- notification_preferences has had a row-level policy since 0006 but the app
-- never wrote to it. Nothing to change in the schema; the gap was the UI.
