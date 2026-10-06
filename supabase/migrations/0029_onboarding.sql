-- Remember that somebody has been shown around.
--
-- On the profile rather than in localStorage: the tour should run once per
-- person, not once per device, and somebody who signs in on a phone and then a
-- laptop has already seen it.
--
-- Nullable, so every existing account is treated as already onboarded by being
-- backfilled below — nobody who has been using the app for a month should be
-- walked through where the Picks tab is.

alter table public.profiles add column if not exists onboarded_at timestamptz;

update public.profiles set onboarded_at = now() where onboarded_at is null;

-- The column has to be in the grant list or the client cannot write it: 0009
-- revoked table-wide update on profiles precisely so that this list is the
-- complete set of things a person may change about themselves.
grant update (onboarded_at) on public.profiles to authenticated;
