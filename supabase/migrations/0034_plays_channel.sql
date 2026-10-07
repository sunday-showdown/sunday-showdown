-- A room that is only plays.
--
-- Every channel so far is a conversation, and a conversation buries the thing
-- people most want to find later: what everybody actually backed. A slip posted
-- on Thursday is twenty messages up by Sunday.
--
-- So a league gets a Plays room where the only thing that can be posted is a
-- bet slip or a pick card, and the only thing that can be done to one is react
-- to it. No chat, no replies, no "lol". It reads as a feed of positions rather
-- than as a thread, and the argument about any of them belongs in Trash Talk.
--
-- Enforced by a trigger rather than by the composer hiding its text box, for
-- the usual reason: the composer is not the only way to insert a row.

alter table public.channels
  add column if not exists plays_only boolean not null default false;

/**
 * A plays room accepts positions and nothing else.
 *
 * `system` is allowed through because the app writes those itself — a room that
 * could not announce its own creation would be a strange exception to make.
 */
create or replace function public.enforce_plays_only()
returns trigger
language plpgsql
as $$
declare
  restricted boolean;
begin
  select c.plays_only into restricted
  from public.channels c where c.id = new.channel_id;

  if not coalesce(restricted, false) then
    return new;
  end if;

  if new.kind not in ('bet_slip', 'pick_card', 'system') then
    raise exception 'that room is for plays only — post a slip or your card'
      using errcode = 'check_violation';
  end if;

  if new.reply_to_id is not null then
    raise exception 'plays cannot be replied to, only reacted to'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_plays_only on public.messages;
create trigger messages_plays_only before insert or update on public.messages
  for each row execute function public.enforce_plays_only();


-- One per league, alongside the rooms every league already has.
insert into public.channels (kind, league_id, name, topic, emoji, position, plays_only)
select 'league', l.id, 'Plays', 'Slips and cards only. React, do not reply.', '💸', 5, true
from public.leagues l
where not exists (
  select 1 from public.channels c
  where c.league_id = l.id and c.plays_only
);

-- And for leagues made from here on. The existing new-league trigger seeds the
-- default rooms; this adds the Plays room to that same path.
create or replace function public.seed_plays_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.channels (kind, league_id, name, topic, emoji, position, plays_only)
  values ('league', new.id, 'Plays', 'Slips and cards only. React, do not reply.', '💸', 5, true);
  return new;
end;
$$;

drop trigger if exists leagues_seed_plays on public.leagues;
create trigger leagues_seed_plays after insert on public.leagues
  for each row execute function public.seed_plays_channel();
