-- Channels get names people would write, not slugs.
--
-- They were lowercase-and-hyphens with a # in front of them, which is Discord's
-- convention and nobody else's. Without the # a slug just looks like a mistake
-- ("trash-talk"), so both go: a channel is called what somebody typed.
--
-- Uniqueness becomes case-insensitive at the same time. "General" and "general"
-- were two different channels under the old rule, which is exactly the kind of
-- near-duplicate a league ends up with and then cannot tell apart.

update public.channels set name = 'General' where name = 'general';
update public.channels set name = 'Trash Talk' where name = 'trash-talk';

-- Fold any pre-existing collisions into one name before the index goes on, so
-- the migration cannot fail on data it could have fixed.
with ranked as (
  select
    id,
    name,
    row_number() over (partition by league_id, lower(name) order by position, created_at) as n
  from public.channels
  where league_id is not null
)
update public.channels c
set name = left(r.name || ' ' || r.n, 40)
from ranked r
where c.id = r.id and r.n > 1;

create unique index if not exists channels_name_per_league_idx
  on public.channels (league_id, lower(name))
  where league_id is not null;

create or replace function public.seed_league_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.channels (kind, league_id, name, topic, emoji, is_default, position, created_by)
  values
    ('league', new.id, 'General', 'Everything else.', '💬', true, 0, new.commissioner_id),
    ('league', new.id, 'Trash Talk', 'Say it to their face.', '🔥', false, 1, new.commissioner_id)
  on conflict do nothing;
  return new;
end
$$;

-- Mode rooms get the same treatment.
update public.channels set name = 'Pick''em' where mode = 'pickem';
update public.channels set name = 'Survivor' where mode = 'survivor';
update public.channels set name = 'TD Scorer' where mode = 'td';
update public.channels set name = 'Head to Head' where mode = 'h2h';
update public.channels set name = 'Playground' where mode = 'playground';

create or replace function public.ensure_mode_channel(target_league uuid, target_mode text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing uuid;
  created uuid;
  label text;
  mark text;
begin
  if not public.is_league_member(target_league) then
    raise exception 'not a member of that league';
  end if;

  select id into existing
  from public.channels
  where league_id = target_league and mode = target_mode;
  if existing is not null then
    return existing;
  end if;

  select l, e into label, mark from (
    values
      ('pickem', 'Pick''em', '🎯'),
      ('survivor', 'Survivor', '🛡️'),
      ('td', 'TD Scorer', '🏈'),
      ('h2h', 'Head to Head', '⚔️'),
      ('playground', 'Playground', '🎲')
  ) as m(k, l, e)
  where m.k = target_mode;

  if label is null then
    raise exception 'unknown mode %', target_mode;
  end if;

  insert into public.channels (kind, league_id, mode, name, topic, emoji, position, created_by)
  values ('mode', target_league, target_mode, label, 'Talk about this mode.', mark, 10, auth.uid())
  on conflict (league_id, mode) do nothing
  returning id into created;

  if created is null then
    select id into created from public.channels
    where league_id = target_league and mode = target_mode;
  end if;

  return created;
end
$$;
