-- The roster, pointed back at football.
--
-- The six archetypes had drifted: a centurion's crest, bull horns, a laurel
-- wreath. That made the arena the dominant identity and the sport the
-- decoration, which is backwards for an app called Sunday Showdown. They are
-- football positions with the equipment pushed a little further now — roughly
-- 70% football, 20% gladiator, 10% street — and the ids changed with them.
--
-- lib/fighters.ts falls back to the first archetype for anything it does not
-- recognise, so a stale row renders rather than breaking; it renders as
-- somebody else's player, which is why this remaps rather than leaving it.

alter table public.fighters alter column archetype set default 'captain';

-- Mapped by temperament, so nobody's fighter changes character: the heaviest
-- stays the heaviest, the quickest stays the quickest.
update public.fighters set archetype = case archetype
  when 'centurion' then 'enforcer'
  when 'juggernaut' then 'juggernaut'
  when 'blitzer' then 'speedster'
  when 'streak' then 'speedster'
  when 'gunslinger' then 'captain'
  when 'bulwark' then 'bruiser'
  else archetype
end
where archetype in ('centurion', 'juggernaut', 'blitzer', 'streak', 'gunslinger', 'bulwark');

-- Anything still unrecognised — a row from the fantasy pass that migration 0025
-- did not reach — becomes the captain rather than being left to fall back
-- silently on every render.
update public.fighters
   set archetype = 'captain'
 where archetype not in
   ('captain', 'speedster', 'playmaker', 'bruiser', 'enforcer', 'juggernaut');
