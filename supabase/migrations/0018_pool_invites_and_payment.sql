-- Pools anyone can start, invite to, and collect for.
--
-- Three gaps this closes.
--
-- A survivor pool had no membership table at all — "who is in it" was inferred
-- from who had made a pick, so somebody invited on Tuesday did not exist until
-- they picked on Sunday, and there was nothing to show them a buy-in against.
-- survivor_members makes membership a fact.
--
-- There was no way in. Leagues have an invite code and a SECURITY DEFINER
-- function to redeem it, for the good reason that a prospective member cannot
-- read a row they are not yet a member of. Pools now work the same way.
--
-- And a pot was one-sided: the owner ticked people off and the people being
-- ticked off had no way to say they had paid. claimed_at is the other half of
-- that conversation. Who may set what is enforced by a trigger rather than by
-- the API, because "only the owner confirms a payment" is exactly the kind of
-- rule that must survive someone talking to the table directly.

-- Membership ----------------------------------------------------------------

create table if not exists public.survivor_members (
  pool_id uuid not null references public.survivor_pools (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

create index if not exists survivor_members_user_idx on public.survivor_members (user_id);

alter table public.survivor_members enable row level security;

drop policy if exists survivor_members_read on public.survivor_members;
create policy survivor_members_read on public.survivor_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.survivor_members m2
      where m2.pool_id = survivor_members.pool_id and m2.user_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists survivor_members_leave_self on public.survivor_members;
create policy survivor_members_leave_self on public.survivor_members
  for delete using (user_id = auth.uid());

-- Anyone who has already played is a member.
insert into public.survivor_members (pool_id, user_id)
select distinct pool_id, user_id from public.survivor_picks
on conflict do nothing;

-- The person who started it is a member of it.
insert into public.survivor_members (pool_id, user_id)
select id, commissioner_id from public.survivor_pools
on conflict do nothing;

-- Invite codes ---------------------------------------------------------------

alter table public.survivor_pools
  add column if not exists invite_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'survivor_pools_invite_code_format'
  ) then
    alter table public.survivor_pools
      add constraint survivor_pools_invite_code_format
      check (invite_code is null or invite_code ~ '^[A-Z0-9]{6,10}$');
  end if;
end
$$;

/** Six characters, no vowels and no 0/O/1/I, so a code read aloud is unambiguous. */
create or replace function public.generate_pool_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '23456789BCDFGHJKLMNPQRSTVWXYZ';
  candidate text;
  attempt integer := 0;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (
      select 1 from public.survivor_pools p where p.invite_code = candidate
    );

    attempt := attempt + 1;
    if attempt > 40 then
      raise exception 'could not allocate an invite code';
    end if;
  end loop;

  return candidate;
end
$$;

update public.survivor_pools set invite_code = public.generate_pool_code() where invite_code is null;

alter table public.survivor_pools alter column invite_code set default public.generate_pool_code();
alter table public.survivor_pools alter column invite_code set not null;

create unique index if not exists survivor_pools_invite_code_idx
  on public.survivor_pools (invite_code);

-- A pool is readable by its members, and by anyone in its league if it has one.
drop policy if exists survivor_pools_read on public.survivor_pools;
create policy survivor_pools_read on public.survivor_pools
  for select using (
    commissioner_id = auth.uid()
    or exists (
      select 1 from public.survivor_members m
      where m.pool_id = survivor_pools.id and m.user_id = auth.uid()
    )
    or (league_id is not null and public.is_league_member(league_id))
    or public.is_admin()
  );

-- Joining --------------------------------------------------------------------

create or replace function public.join_pool_by_code(code text)
returns table (pool_id uuid, pool_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  joiner uuid := auth.uid();
begin
  if joiner is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if code is null or code !~ '^[A-Za-z0-9]{6,10}$' then
    raise exception 'invalid invite code' using errcode = 'invalid_parameter_value';
  end if;

  select p.id, p.name, p.status into target
  from public.survivor_pools p
  where upper(p.invite_code) = upper(code);

  if not found then
    raise exception 'no pool for that code' using errcode = 'no_data_found';
  end if;

  if target.status in ('completed', 'cancelled') then
    raise exception 'that pool is finished' using errcode = 'check_violation';
  end if;

  insert into public.survivor_members (pool_id, user_id)
  values (target.id, joiner)
  on conflict do nothing;

  update public.survivor_pools p
  set member_count = (select count(*) from public.survivor_members m where m.pool_id = p.id),
      alive_count = greatest(
        p.alive_count,
        (select count(*) from public.survivor_members m where m.pool_id = p.id)
          - p.eliminated_count
      )
  where p.id = target.id;

  return query select target.id, target.name;
end
$$;

revoke all on function public.join_pool_by_code(text) from public;
grant execute on function public.join_pool_by_code(text) to authenticated;

-- Payment ---------------------------------------------------------------------

alter table public.pot_participants
  add column if not exists claimed_at timestamptz;

-- A participant can put themselves on the list and say they have paid. Only the
-- pot's owner can confirm it.
drop policy if exists pot_participants_claim_self on public.pot_participants;
create policy pot_participants_claim_self on public.pot_participants
  for insert with check (user_id = auth.uid());

drop policy if exists pot_participants_update_self on public.pot_participants;
create policy pot_participants_update_self on public.pot_participants
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.enforce_pot_payment_authority()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  actor uuid := auth.uid();
begin
  select p.owner_id into owner from public.pots p where p.id = new.pot_id;

  -- A server job acts with no auth.uid(); it is trusted and already past RLS.
  if actor is null then
    return new;
  end if;

  if actor = owner then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Adding yourself is fine. Arriving pre-paid is not.
    new.paid := false;
    new.paid_at := null;
    return new;
  end if;

  if new.paid is distinct from old.paid or new.paid_at is distinct from old.paid_at then
    raise exception 'only the pot owner can confirm a payment';
  end if;
  if new.user_id is distinct from old.user_id or new.pot_id is distinct from old.pot_id then
    raise exception 'a pot entry cannot change who or what it belongs to';
  end if;
  if new.payout_amount is distinct from old.payout_amount
     or new.payout_paid is distinct from old.payout_paid then
    raise exception 'only the pot owner can record a payout';
  end if;

  return new;
end
$$;

drop trigger if exists pot_participants_payment_authority on public.pot_participants;
create trigger pot_participants_payment_authority
  before insert or update on public.pot_participants
  for each row execute function public.enforce_pot_payment_authority();

-- A pot can belong to one competition rather than to the mode in general, which
-- is what lets a specific survivor pool have its own buy-in.
create unique index if not exists pots_one_per_competition_idx
  on public.pots (competition_type, competition_id)
  where competition_id is not null;
