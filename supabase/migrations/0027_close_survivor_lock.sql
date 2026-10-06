-- Close the survivor pick lock.
--
-- The lock read the kickoff of the game a pick named, and returned early when
-- the pick named no game at all:
--
--   if target_game is null then return new; end if;
--
-- game_id is nullable, and RLS lets a player write survivor_picks directly —
-- the API resolves the game server side and refuses a kicked-off one, but the
-- API is not the only way in. So the check could be skipped in two steps:
--
--   1. insert a pick with team_abbr set and game_id null — no game, no check
--   2. update it to point at the finished game — the update branch only
--      objected when team_abbr changed, and it had not
--
-- Which is a player entering a survivor pick on Monday for a team they had
-- already watched win. Verified against this database before the fix.
--
-- Two changes. A pick with no game_id now has its game resolved here, from the
-- season, week and team, so there is no longer a "no game" case to fall
-- through — and the row comes out complete, which also means grading never has
-- to guess which side was picked. And on update, pointing an existing pick at a
-- different game is treated exactly like changing the team, because it is.

create or replace function public.enforce_survivor_pick_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game uuid;
  kickoff timestamptz;
  game_home text;
  game_away text;
begin
  if tg_op = 'DELETE' then
    select g.start_time into kickoff from public.nfl_games g where g.id = old.game_id;
    if kickoff is not null and now() >= kickoff then
      raise exception 'survivor pick is locked and cannot be deleted'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- The game this pick is really on, whether or not the writer named it.
  target_game := new.game_id;

  if target_game is null then
    select g.id into target_game
      from public.nfl_games g
     where g.season = new.season
       and g.week = new.week
       and (g.home_abbr = new.team_abbr or g.away_abbr = new.team_abbr)
     order by g.start_time
     limit 1;
  end if;

  -- A pick on a team with no fixture cannot be graded and cannot be locked, so
  -- it is not a pick.
  if target_game is null then
    raise exception '% is not playing in week %', new.team_abbr, new.week
      using errcode = 'check_violation';
  end if;

  select g.start_time, g.home_abbr, g.away_abbr
    into kickoff, game_home, game_away
    from public.nfl_games g where g.id = target_game;

  if kickoff is not null and now() >= kickoff then
    if tg_op = 'INSERT' then
      raise exception 'survivor pick for week % is locked', new.week
        using errcode = 'check_violation';
    end if;

    -- Re-aiming a locked pick at another game changes its result just as surely
    -- as changing the team does.
    if new.team_abbr is distinct from old.team_abbr
       or new.game_id is distinct from old.game_id then
      raise exception 'survivor pick for week % is locked', new.week
        using errcode = 'check_violation';
    end if;
  end if;

  -- Normalise, so a pick is always complete however it arrived.
  new.game_id := target_game;
  new.is_home := (game_home = new.team_abbr);
  new.opponent_abbr := case when game_home = new.team_abbr then game_away else game_home end;

  return new;
end;
$$;
