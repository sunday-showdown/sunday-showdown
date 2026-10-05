-- Sharing your card into a channel.
--
-- The message stores which contest it was, not a copy of the picks. That is the
-- whole point: a snapshot would be frozen at the moment it was posted, whereas
-- a reference re-reads the picks every time the message renders — so a card
-- shared on Thursday fills in with wins and losses through Sunday, in the
-- channel, while people are watching. It is also the honest version. Picks are
-- already readable by league members under RLS, and copying them into a message
-- body would be a second place for them to live and disagree.
--
-- There is nothing to stop somebody sharing a card that is not theirs, and
-- nothing needs to: the renderer reads the picks of whoever sent the message,
-- so the only card you can post is your own.

alter table public.messages
  add column if not exists card_challenge_id uuid references public.pickem_challenges (id) on delete cascade;

create index if not exists messages_card_idx
  on public.messages (card_challenge_id) where card_challenge_id is not null;

-- Every kind still has to carry its own payload.
alter table public.messages drop constraint if exists messages_payload;
alter table public.messages add constraint messages_payload check (
  deleted_at is not null
  or (kind = 'text' and body is not null)
  or (kind = 'image' and attachment_url is not null)
  or (kind = 'bet_slip' and bet_id is not null)
  or (kind = 'pick_card' and card_challenge_id is not null)
  or kind = 'system'
);

-- A shared card cannot be repointed at a different week after the fact, for the
-- same reason a slip cannot be swapped under the people who tailed it.
create or replace function public.enforce_message_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.channel_id <> old.channel_id then
    raise exception 'a message cannot move between channels';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'a message cannot change author';
  end if;
  if new.kind <> old.kind then
    raise exception 'a message cannot change kind';
  end if;
  if new.bet_id is distinct from old.bet_id then
    raise exception 'a message cannot change which bet it shares';
  end if;
  if new.card_challenge_id is distinct from old.card_challenge_id then
    raise exception 'a message cannot change which card it shares';
  end if;
  if new.attachment_url is distinct from old.attachment_url and new.deleted_at is null then
    raise exception 'a message cannot change its attachment';
  end if;
  if new.created_at <> old.created_at then
    raise exception 'a message cannot change when it was sent';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'a deleted message cannot be restored';
  end if;
  return new;
end
$$;

-- One card per person per contest per channel, so tapping share twice does not
-- post the same week twice.
create unique index if not exists messages_one_card_per_contest_idx
  on public.messages (channel_id, user_id, card_challenge_id)
  where card_challenge_id is not null and deleted_at is null;
