-- Survivor, head-to-head, playground, social feed, notifications, pots.
--
-- Two departures from the old entity model, both deliberate:
--
-- 1. Denormalised `username` columns are gone. Every row referenced a profile
--    AND carried a copy of its username, so a rename left stale names scattered
--    across activity, challenges and results. Names are joined from profiles.
--
-- 2. `reactions` was a jsonb blob on the parent row. It is now a table with a
--    unique constraint per (item, user, emoji), which makes a double-tap or a
--    retrying client idempotent instead of double-counting.

-- Survivor -------------------------------------------------------------------

create table public.survivor_pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  league_id uuid references public.leagues (id) on delete cascade,
  commissioner_id uuid not null references public.profiles (user_id) on delete restrict,
  season integer not null,
  status pool_status not null default 'open',
  current_week integer not null default 1,
  buy_in numeric(10, 2) not null default 0,
  pot_enabled boolean not null default false,
  payout_structure text,
  -- How a week with every remaining player eliminated is settled.
  tie_rule text not null default 'split',
  member_count integer not null default 0,
  alive_count integer not null default 0,
  eliminated_count integer not null default 0,
  winner_id uuid references public.profiles (user_id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint survivor_pools_name_len check (char_length(name) between 3 and 48),
  constraint survivor_pools_buy_in_nonneg check (buy_in >= 0),
  constraint survivor_pools_counts_nonneg check (
    member_count >= 0 and alive_count >= 0 and eliminated_count >= 0
  )
);

create trigger survivor_pools_touch before update on public.survivor_pools
  for each row execute function public.touch_updated_at();

create index survivor_pools_league_idx on public.survivor_pools (league_id, season);


create table public.survivor_picks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.survivor_pools (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  season integer not null,
  week integer not null,

  team_abbr text not null references public.nfl_teams (abbr),
  game_id uuid references public.nfl_games (id) on delete restrict,
  opponent_abbr text references public.nfl_teams (abbr),
  is_home boolean,

  result survivor_pick_result not null default 'pending',
  eliminated_at timestamptz,
  graded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One pick per week per pool.
  unique (pool_id, user_id, season, week),
  -- The core Survivor rule: a team may never be reused within a pool.
  unique (pool_id, user_id, team_abbr),

  constraint survivor_picks_graded_has_timestamp check (
    (result = 'pending' and graded_at is null) or (result <> 'pending' and graded_at is not null)
  )
);

create trigger survivor_picks_touch before update on public.survivor_picks
  for each row execute function public.touch_updated_at();

create index survivor_picks_pool_week_idx on public.survivor_picks (pool_id, season, week);
create index survivor_picks_user_idx on public.survivor_picks (user_id, season);


-- Survivor locks on its own game's kickoff, not the weekly Sunday lock: a pick
-- on a Thursday game must be final when that game starts.
create or replace function public.enforce_survivor_pick_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kickoff timestamptz;
  target_game uuid;
begin
  target_game := case when tg_op = 'DELETE' then old.game_id else new.game_id end;

  if target_game is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select g.start_time into kickoff from public.nfl_games g where g.id = target_game;

  if kickoff is not null and now() >= kickoff then
    if tg_op = 'DELETE' then
      raise exception 'survivor pick is locked and cannot be deleted'
        using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' or new.team_abbr is distinct from old.team_abbr then
      raise exception 'survivor pick for week % is locked', new.week
        using errcode = 'check_violation';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger survivor_picks_lock before insert or update on public.survivor_picks
  for each row execute function public.enforce_survivor_pick_lock();

create trigger survivor_picks_delete_lock before delete on public.survivor_picks
  for each row execute function public.enforce_survivor_pick_lock();


-- Head to head ---------------------------------------------------------------

create table public.h2h_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles (user_id) on delete cascade,
  opponent_id uuid not null references public.profiles (user_id) on delete cascade,
  league_id uuid not null references public.leagues (id) on delete cascade,
  challenge_type text not null,
  season integer not null,
  week integer not null,

  status challenge_status not null default 'pending',
  winner_id uuid references public.profiles (user_id) on delete set null,
  challenger_score numeric(8, 2),
  opponent_score numeric(8, 2),

  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- No self-challenges, and one challenge per pair per week: a retrying client
  -- or an impatient double-tap cannot spam an opponent's inbox.
  constraint h2h_no_self_challenge check (challenger_id <> opponent_id),
  unique (challenger_id, opponent_id, league_id, season, week, challenge_type)
);

create trigger h2h_challenges_touch before update on public.h2h_challenges
  for each row execute function public.touch_updated_at();

create index h2h_challenges_opponent_idx on public.h2h_challenges (opponent_id, status);
create index h2h_challenges_challenger_idx on public.h2h_challenges (challenger_id, status);
create index h2h_challenges_league_week_idx on public.h2h_challenges (league_id, season, week);


-- Lifetime record between two players.
--
-- The pair is stored canonically (user_a_id < user_b_id) so that one matchup
-- cannot end up with two rows disagreeing about the record.
create table public.h2h_records (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_a_id uuid not null references public.profiles (user_id) on delete cascade,
  user_b_id uuid not null references public.profiles (user_id) on delete cascade,

  user_a_wins integer not null default 0,
  user_b_wins integer not null default 0,
  ties integer not null default 0,
  total_matchups integer not null default 0,

  current_streak_user_id uuid references public.profiles (user_id) on delete set null,
  current_streak_count integer not null default 0,

  biggest_win_user_id uuid references public.profiles (user_id) on delete set null,
  biggest_win_margin numeric(8, 2),
  closest_margin numeric(8, 2),
  last_matchup_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (league_id, user_a_id, user_b_id),
  constraint h2h_records_canonical_pair check (user_a_id < user_b_id),
  constraint h2h_records_counts_nonneg check (
    user_a_wins >= 0 and user_b_wins >= 0 and ties >= 0 and total_matchups >= 0
  ),
  constraint h2h_records_totals_agree check (
    total_matchups = user_a_wins + user_b_wins + ties
  )
);

create trigger h2h_records_touch before update on public.h2h_records
  for each row execute function public.touch_updated_at();

create index h2h_records_user_a_idx on public.h2h_records (user_a_id);
create index h2h_records_user_b_idx on public.h2h_records (user_b_id);


-- Playground -----------------------------------------------------------------

create table public.playground_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  league_id uuid references public.leagues (id) on delete cascade,
  season integer not null,
  week integer not null,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint playground_published_has_timestamp check (
    (not is_published and published_at is null) or (is_published and published_at is not null)
  )
);

create trigger playground_cards_touch before update on public.playground_cards
  for each row execute function public.touch_updated_at();

-- One card per user per week. Split in two because a plain unique constraint
-- treats each NULL league_id as distinct, which would let a solo card be
-- created over and over for the same week.
create unique index playground_cards_one_per_league_week
  on public.playground_cards (user_id, league_id, season, week)
  where league_id is not null;

create unique index playground_cards_one_solo_per_week
  on public.playground_cards (user_id, season, week)
  where league_id is null;

create index playground_cards_league_week_idx on public.playground_cards (league_id, season, week)
  where is_published;


create table public.playground_picks (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.playground_cards (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  season integer not null,
  week integer not null,

  pick_type text not null,
  target_name text not null,
  target_team_abbr text references public.nfl_teams (abbr),
  opponent_abbr text references public.nfl_teams (abbr),
  position text,
  prediction text,
  game_id uuid references public.nfl_games (id) on delete set null,
  american_odds integer,
  td_point_value numeric(6, 2),
  confidence integer,
  is_pick_of_the_week boolean not null default false,

  result pick_result not null default 'pending',
  graded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint playground_confidence_range check (confidence is null or confidence between 1 and 5)
);

create trigger playground_picks_touch before update on public.playground_picks
  for each row execute function public.touch_updated_at();

create index playground_picks_card_idx on public.playground_picks (card_id);

-- At most one pick of the week per card.
create unique index playground_one_potw_per_card
  on public.playground_picks (card_id)
  where is_pick_of_the_week;


-- Social ---------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null references public.profiles (user_id) on delete cascade,
  following_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id);


create table public.league_activity (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid references public.profiles (user_id) on delete set null,
  activity_type text not null,
  message text not null,
  season integer,
  week integer,
  -- Natural key for generated activity, so re-running the generator updates
  -- rather than duplicating a feed item.
  dedup_key text,
  created_at timestamptz not null default now(),

  constraint activity_message_len check (char_length(message) between 1 and 500)
);

create unique index league_activity_dedup
  on public.league_activity (league_id, dedup_key)
  where dedup_key is not null;

create index league_activity_feed_idx on public.league_activity (league_id, created_at desc);


create table public.activity_reactions (
  activity_id uuid not null references public.league_activity (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),

  primary key (activity_id, user_id, emoji),
  constraint activity_reactions_emoji_len check (char_length(emoji) between 1 and 8)
);

create index activity_reactions_activity_idx on public.activity_reactions (activity_id);


create table public.playground_pick_reactions (
  pick_id uuid not null references public.playground_picks (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),

  primary key (pick_id, user_id, emoji),
  constraint playground_reactions_emoji_len check (char_length(emoji) between 1 and 8)
);

create index playground_pick_reactions_pick_idx on public.playground_pick_reactions (pick_id);


create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_unread_idx on public.notifications (user_id, created_at desc)
  where not is_read;
create index notifications_user_idx on public.notifications (user_id, created_at desc);


create table public.notification_preferences (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  deadline_approaching boolean not null default true,
  picks_locked boolean not null default true,
  game_final boolean not null default true,
  first_place boolean not null default true,
  passed_in_standings boolean not null default true,
  td_scored boolean not null default true,
  weekly_results boolean not null default true,
  achievements boolean not null default true,
  -- Web push subscription, set once the browser grants permission.
  push_subscription jsonb,
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function public.touch_updated_at();


create table public.achievements (
  id text primary key,
  name text not null,
  description text not null,
  icon text,
  category text,
  sort_order integer not null default 0
);


create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  league_id uuid references public.leagues (id) on delete set null,
  season integer,
  week integer,
  earned_at timestamptz not null default now()
);

create index user_achievements_user_idx on public.user_achievements (user_id, earned_at desc);

-- Earned once per user per season. A season-less (career) achievement is
-- earned once ever, which a plain unique constraint would not enforce because
-- each NULL season counts as distinct.
create unique index user_achievements_once_per_season
  on public.user_achievements (user_id, achievement_id, season)
  where season is not null;

create unique index user_achievements_once_career
  on public.user_achievements (user_id, achievement_id)
  where season is null;


-- Pots -----------------------------------------------------------------------

create table public.pots (
  id uuid primary key default gen_random_uuid(),
  name text,
  competition_type text not null,
  competition_id uuid,
  league_id uuid references public.leagues (id) on delete cascade,
  owner_id uuid not null references public.profiles (user_id) on delete restrict,
  season integer not null,
  buy_in numeric(10, 2) not null default 0,
  payout_structure text,
  payout_config jsonb not null default '{}'::jsonb,
  status pool_status not null default 'open',
  confirmed_pool numeric(12, 2) not null default 0,
  projected_pool numeric(12, 2) not null default 0,
  paid_count integer not null default 0,
  total_participants integer not null default 0,
  winner_id uuid references public.profiles (user_id) on delete set null,
  payout_amount numeric(12, 2),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pots_buy_in_nonneg check (buy_in >= 0),
  constraint pots_pools_nonneg check (confirmed_pool >= 0 and projected_pool >= 0),
  constraint pots_counts_nonneg check (paid_count >= 0 and total_participants >= 0),
  constraint pots_paid_within_total check (paid_count <= total_participants)
);

create trigger pots_touch before update on public.pots
  for each row execute function public.touch_updated_at();

create index pots_league_idx on public.pots (league_id, season);


create table public.pot_participants (
  id uuid primary key default gen_random_uuid(),
  pot_id uuid not null references public.pots (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  paid boolean not null default false,
  paid_at timestamptz,
  payout_amount numeric(12, 2),
  payout_paid boolean not null default false,
  payout_paid_at timestamptz,
  created_at timestamptz not null default now(),

  unique (pot_id, user_id),
  constraint pot_participants_paid_has_timestamp check (
    (not paid and paid_at is null) or (paid and paid_at is not null)
  )
);

create index pot_participants_pot_idx on public.pot_participants (pot_id);


-- Money changes hands outside the app, so who marked what and when is the only
-- record of a dispute. Append-only: no update or delete policy exists.
create table public.pot_audit (
  id uuid primary key default gen_random_uuid(),
  pot_id uuid not null references public.pots (id) on delete cascade,
  league_id uuid references public.leagues (id) on delete set null,
  actor_id uuid not null references public.profiles (user_id) on delete restrict,
  action text not null,
  target_user_id uuid references public.profiles (user_id) on delete set null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index pot_audit_pot_idx on public.pot_audit (pot_id, created_at desc);


-- Policies -------------------------------------------------------------------

alter table public.survivor_pools enable row level security;
alter table public.survivor_picks enable row level security;
alter table public.h2h_challenges enable row level security;
alter table public.h2h_records enable row level security;
alter table public.playground_cards enable row level security;
alter table public.playground_picks enable row level security;
alter table public.follows enable row level security;
alter table public.league_activity enable row level security;
alter table public.activity_reactions enable row level security;
alter table public.playground_pick_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.pots enable row level security;
alter table public.pot_participants enable row level security;
alter table public.pot_audit enable row level security;

create policy survivor_pools_read on public.survivor_pools
  for select using (
    league_id is null or public.is_league_member(league_id) or public.is_admin()
  );

create policy survivor_pools_write_commissioner on public.survivor_pools
  for all using (commissioner_id = auth.uid() or public.is_admin())
  with check (commissioner_id = auth.uid() or public.is_admin());

-- Survivor picks are hidden until their game kicks off, then visible to the
-- pool. Everyone revealing simultaneously is the point of the format.
create policy survivor_picks_read on public.survivor_picks
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.nfl_games g
      where g.id = survivor_picks.game_id and now() >= g.start_time
    )
  );

create policy survivor_picks_insert_own on public.survivor_picks
  for insert with check (user_id = auth.uid());

create policy survivor_picks_update_own on public.survivor_picks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy survivor_picks_delete_own on public.survivor_picks
  for delete using (user_id = auth.uid());


create policy h2h_challenges_read on public.h2h_challenges
  for select using (
    challenger_id = auth.uid() or opponent_id = auth.uid()
    or public.is_league_member(league_id) or public.is_admin()
  );

create policy h2h_challenges_insert on public.h2h_challenges
  for insert with check (
    challenger_id = auth.uid() and public.is_league_member(league_id)
  );

-- Either party may act on a challenge: the challenger cancels, the opponent
-- accepts or declines. Scores and winner are written by grading.
create policy h2h_challenges_update_party on public.h2h_challenges
  for update using (challenger_id = auth.uid() or opponent_id = auth.uid())
  with check (challenger_id = auth.uid() or opponent_id = auth.uid());

create policy h2h_records_read on public.h2h_records
  for select using (public.is_league_member(league_id) or public.is_admin());


create policy playground_cards_read on public.playground_cards
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or (is_published and league_id is not null and public.is_league_member(league_id))
  );

create policy playground_cards_write_own on public.playground_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy playground_picks_read on public.playground_picks
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.playground_cards c
      where c.id = playground_picks.card_id
        and c.is_published
        and c.league_id is not null
        and public.is_league_member(c.league_id)
    )
  );

create policy playground_picks_write_own on public.playground_picks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


create policy follows_read on public.follows
  for select using (auth.uid() is not null);

create policy follows_write_own on public.follows
  for all using (follower_id = auth.uid()) with check (follower_id = auth.uid());


create policy league_activity_read on public.league_activity
  for select using (public.is_league_member(league_id) or public.is_admin());

create policy activity_reactions_read on public.activity_reactions
  for select using (
    exists (
      select 1 from public.league_activity a
      where a.id = activity_reactions.activity_id and public.is_league_member(a.league_id)
    )
  );

create policy activity_reactions_write_own on public.activity_reactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy playground_reactions_read on public.playground_pick_reactions
  for select using (auth.uid() is not null);

create policy playground_reactions_write_own on public.playground_pick_reactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


create policy notifications_read_own on public.notifications
  for select using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete using (user_id = auth.uid());

create policy notification_preferences_own on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


create policy achievements_read on public.achievements
  for select using (auth.uid() is not null);

create policy user_achievements_read on public.user_achievements
  for select using (auth.uid() is not null);


create policy pots_read on public.pots
  for select using (
    owner_id = auth.uid()
    or (league_id is not null and public.is_league_member(league_id))
    or public.is_admin()
  );

create policy pots_write_owner on public.pots
  for all using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

create policy pot_participants_read on public.pot_participants
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.pots p where p.id = pot_participants.pot_id and p.owner_id = auth.uid())
    or public.is_admin()
  );

create policy pot_participants_write_owner on public.pot_participants
  for all using (
    exists (select 1 from public.pots p where p.id = pot_participants.pot_id and p.owner_id = auth.uid())
    or public.is_admin()
  )
  with check (
    exists (select 1 from public.pots p where p.id = pot_participants.pot_id and p.owner_id = auth.uid())
    or public.is_admin()
  );

create policy pot_audit_read on public.pot_audit
  for select using (
    exists (select 1 from public.pots p where p.id = pot_audit.pot_id and p.owner_id = auth.uid())
    or (league_id is not null and public.is_league_member(league_id))
    or public.is_admin()
  );

create policy pot_audit_insert on public.pot_audit
  for insert with check (actor_id = auth.uid());
