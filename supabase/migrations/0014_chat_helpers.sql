-- Unread counts, in one query.
--
-- The channel list needs, per channel, how many messages have arrived since
-- this person last looked. Done from the application that is a query per
-- channel on a screen that is itself a list of channels — so it is a function
-- instead, and the list costs one round trip however many rooms a league has.
--
-- Two deliberate bounds:
--
--   * Only the last 30 days count. An unread badge reading 4,000 after the
--     offseason is not information, and without the bound the count scans the
--     whole history of a channel every time the list renders.
--   * Your own messages never count as unread, which is what makes the badge
--     mean "somebody said something to you".

create or replace function public.channel_unread_counts()
returns table (channel_id uuid, unread integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    (
      select count(*)
      from public.messages m
      where m.channel_id = c.id
        and m.deleted_at is null
        and m.user_id is distinct from auth.uid()
        and m.created_at > greatest(
          coalesce(r.last_read_at, '-infinity'::timestamptz),
          now() - interval '30 days'
        )
    )::integer as unread
  from public.channels c
  left join public.channel_reads r
    on r.channel_id = c.id and r.user_id = auth.uid()
  where case
    when c.kind = 'dm' then exists (
      select 1 from public.channel_members m2
      where m2.channel_id = c.id and m2.user_id = auth.uid()
    )
    else public.is_league_member(c.league_id)
  end;
$$;

revoke all on function public.channel_unread_counts() from public;
grant execute on function public.channel_unread_counts() to authenticated;

-- Marking a channel read.
--
-- An upsert from the client would do, but it would also let somebody move their
-- own marker into the future and permanently zero a badge. This only ever moves
-- it forward, and only to now.

create or replace function public.mark_channel_read(target_channel uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_channel(target_channel) then
    raise exception 'no such channel';
  end if;

  insert into public.channel_reads (channel_id, user_id, last_read_at)
  values (target_channel, auth.uid(), now())
  on conflict (channel_id, user_id) do update
  set last_read_at = greatest(public.channel_reads.last_read_at, now());
end
$$;

revoke all on function public.mark_channel_read(uuid) from public;
grant execute on function public.mark_channel_read(uuid) to authenticated;

-- Supporting index: the unread count filters by channel, author and recency.
create index if not exists messages_channel_live_idx
  on public.messages (channel_id, created_at desc)
  where deleted_at is null;
