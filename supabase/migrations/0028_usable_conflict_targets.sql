-- Make the dedup indexes usable as ON CONFLICT targets.
--
-- Three tables deduplicate by a key, and all three did it with a *partial*
-- unique index:
--
--   create unique index ... on notifications (user_id, notification_key)
--     where notification_key is not null;
--
-- Postgres will only use a partial index to arbitrate an ON CONFLICT if the
-- statement repeats its predicate, and PostgREST has no way to express that. So
-- every upsert against these targets failed outright with
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- and the write was lost. Grading reported the failure as a warning and carried
-- on, which is why this survived: the week still graded, the standings were
-- right, and the two things that quietly never happened were the notification
-- and the feed entry. Across 52 graded weekly results this database held zero
-- notifications and zero activity rows. The bell and the highlights feed had
-- never worked, and web push — which only ever sends what the notification
-- table accepted — could never have fired.
--
-- Found by seeding four weeks of history and grading them, which is the first
-- time the code had run against a week with picks in it.
--
-- Plain unique indexes fix it. They arbitrate, and they allow a row with no key
-- exactly as before: NULLs are distinct in a unique index, so any number of
-- keyless notifications still coexist.

drop index if exists public.notifications_key_once;
create unique index notifications_key_once
  on public.notifications (user_id, notification_key);

drop index if exists public.league_activity_dedup;
create unique index league_activity_dedup
  on public.league_activity (league_id, dedup_key);


-- Achievements had the opposite problem: two partial indexes, one for seasonal
-- awards and one for career awards, neither usable as an arbiter. The insert
-- fell back to the primary key, which never conflicts, so a second grading run
-- raised a duplicate-key error against the career index instead of ignoring it.
--
-- One index does both jobs, with NULLS NOT DISTINCT so that a career award —
-- which has no season — collides with itself the way the partial index used to
-- make it.
drop index if exists public.user_achievements_once_per_season;
drop index if exists public.user_achievements_once_career;

create unique index user_achievements_once
  on public.user_achievements (user_id, achievement_id, season) nulls not distinct;
