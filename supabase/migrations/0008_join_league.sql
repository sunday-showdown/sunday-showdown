-- Joining a league by invite code.
--
-- Needs to be a SECURITY DEFINER function rather than a client query: leagues
-- are only selectable by their members, so a prospective member cannot read the
-- league to find it. The invite code is the credential, and this function is the
-- only thing that accepts it.
--
-- Doing it in one function also makes the join atomic. The membership insert and
-- the member_count update cannot drift, and two people joining at once cannot
-- both read the same count and write the same total.

create or replace function public.join_league_by_code(code text)
returns table (league_id uuid, league_name text)
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

  select l.id, l.name into target
  from public.leagues l
  where upper(l.invite_code) = upper(code);

  if not found then
    raise exception 'no league for that code' using errcode = 'no_data_found';
  end if;

  if exists (
    select 1 from public.league_members m
    where m.league_id = target.id and m.user_id = joiner
  ) then
    raise exception 'already a member' using errcode = 'unique_violation';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (target.id, joiner, 'member');

  -- Counted from the table rather than incremented, so the number cannot drift
  -- away from reality.
  update public.leagues l
  set member_count = (
    select count(*) from public.league_members m where m.league_id = l.id
  )
  where l.id = target.id;

  return query select target.id, target.name;
end;
$$;

revoke all on function public.join_league_by_code(text) from public;
grant execute on function public.join_league_by_code(text) to authenticated;


-- Creating a league has the same two-write problem: the league and its
-- commissioner's membership must both exist or neither should.
create or replace function public.create_league(league_name text, league_season integer)
returns table (league_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  creator uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  attempt integer := 0;
  new_id uuid;
begin
  if creator is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if league_name is null or char_length(trim(league_name)) not between 3 and 48 then
    raise exception 'league names are 3 to 48 characters'
      using errcode = 'invalid_parameter_value';
  end if;

  loop
    attempt := attempt + 1;

    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    begin
      insert into public.leagues (name, commissioner_id, invite_code, season, current_week, member_count)
      values (trim(league_name), creator, candidate, league_season, 1, 1)
      returning id into new_id;
      exit;
    exception when unique_violation then
      if attempt >= 10 then
        raise exception 'could not allocate an invite code';
      end if;
    end;
  end loop;

  insert into public.league_members (league_id, user_id, role)
  values (new_id, creator, 'commissioner');

  return query select new_id, candidate;
end;
$$;

revoke all on function public.create_league(text, integer) from public;
grant execute on function public.create_league(text, integer) to authenticated;
