-- Make notifications idempotent.
--
-- Grading runs every few minutes. Without a key, every run would re-notify the
-- same result and the bell would fill with duplicates of one event.

alter table public.notifications add column if not exists notification_key text;

-- Unique per user, and only where a key is set: a notification written by hand
-- without one is still allowed.
create unique index if not exists notifications_key_once
  on public.notifications (user_id, notification_key)
  where notification_key is not null;

create index if not exists notifications_unread_count_idx
  on public.notifications (user_id)
  where not is_read;
