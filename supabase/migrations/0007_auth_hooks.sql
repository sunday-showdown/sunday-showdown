-- Create a profile whenever an auth user is created.
--
-- Done here rather than from the client so a profile always exists: the client
-- path cannot run when email confirmation is on (there is no session yet), and
-- a user without a profile breaks every join in the app.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text;
  candidate text;
  suffix integer := 0;
begin
  requested := nullif(trim(new.raw_user_meta_data ->> 'username'), '');

  -- Fall back to the local part of the email, then to a generic name, and
  -- strip anything the username_format constraint would reject.
  if requested is null then
    requested := split_part(coalesce(new.email, ''), '@', 1);
  end if;

  requested := regexp_replace(coalesce(requested, ''), '[^A-Za-z0-9_]', '', 'g');

  if char_length(requested) < 3 then
    requested := 'player';
  end if;

  requested := left(requested, 20);
  candidate := requested;

  -- Usernames are unique. Rather than failing the signup, find the first free
  -- variant; the user can rename later.
  while exists (select 1 from public.profiles p where lower(p.username) = lower(candidate)) loop
    suffix := suffix + 1;
    candidate := left(requested, 20) || suffix::text;
    if suffix > 9999 then
      candidate := 'player' || replace(new.id::text, '-', '');
      candidate := left(candidate, 24);
      exit;
    end if;
  end loop;

  insert into public.profiles (user_id, username)
  values (new.id, candidate)
  on conflict (user_id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Seed the achievement catalogue. Rows are referenced by stable text ids, so
-- they are safe to insert idempotently.
insert into public.achievements (id, name, description, icon, category, sort_order) values
  ('first_pick',        'Welcome Aboard',  'Made your first pick.',                        'flag',    'milestone', 10),
  ('first_win',         'Off the Mark',    'Won your first pick.',                         'check',   'milestone', 20),
  ('perfect_week',      'Perfect Week',    'Won every pick on your card.',                 'star',    'pickem',    30),
  ('weekly_winner',     'Week Winner',     'Finished first in your league for a week.',    'trophy',  'pickem',    40),
  ('streak_5',          'Heater',          'Won five picks in a row.',                     'flame',   'streak',    50),
  ('streak_10',         'Unconscious',     'Won ten picks in a row.',                      'flame',   'streak',    60),
  ('underdog_hero',     'Giant Killer',    'Won a moneyline pick at +250 or longer.',      'zap',     'pickem',    70),
  ('survivor_champion', 'Last One Standing','Won a survivor pool.',                        'shield',  'survivor',  80),
  ('full_season',       'Never Missed',    'Made picks in all 18 weeks of a season.',      'calendar','milestone', 90)
on conflict (id) do nothing;
