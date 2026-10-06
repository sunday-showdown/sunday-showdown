-- Football gladiators, and a ledger for throwaway data.
--
-- Two unrelated things that both have to land before the next seed runs.
--
-- The six fighter archetypes were generic fantasy classes — a brawler, an
-- oracle, a titan — so a football app called Showdown had a wizard standing in
-- its arena. They are football positions crossed with arena figures now, and
-- the ids changed with them. lib/fighters.ts falls back to the first archetype
-- for anything it does not recognise, so a stale row renders rather than
-- breaking, but it renders as somebody else's fighter; this remaps them.
--
-- And the demo data. Weeks 1 to 4 of this season are empty, so every board in
-- the app is a blank slate and nothing can be judged by looking at it. Filling
-- them in means writing rows that are not real and must come out cleanly the
-- moment actual people arrive. "Delete anything that looks like test data" is
-- not a plan — it guesses, and it guesses about the production tables. So the
-- seed records every row it creates, and the teardown deletes exactly those.

-- Archetypes -----------------------------------------------------------------

alter table public.fighters alter column archetype set default 'centurion';

-- Mapped by temperament rather than alphabetically, so somebody who picked the
-- heaviest fighter still has the heaviest fighter.
update public.fighters set archetype = case archetype
  when 'brawler' then 'blitzer'
  when 'gladiator' then 'bulwark'
  when 'duelist' then 'streak'
  when 'berserker' then 'juggernaut'
  when 'oracle' then 'gunslinger'
  when 'titan' then 'centurion'
  else archetype
end
where archetype in ('brawler', 'gladiator', 'duelist', 'berserker', 'oracle', 'titan');


-- The demo ledger -------------------------------------------------------------

-- One row per row the seed created, so teardown is a delete by primary key and
-- never a heuristic. Deliberately not a foreign key to anything: the point is
-- that it outlives the row long enough to delete it, and a cascade would empty
-- the ledger the moment anything else did.
create table if not exists public.demo_seed (
  id uuid primary key default gen_random_uuid(),
  -- Which seed run created it, so a second run can be removed on its own.
  batch text not null,
  table_name text not null,
  row_id text not null,
  -- Lower numbers are deleted first; children before parents.
  tier integer not null default 0,
  created_at timestamptz not null default now(),

  unique (table_name, row_id)
);

create index if not exists demo_seed_batch_idx on public.demo_seed (batch, tier);

alter table public.demo_seed enable row level security;

-- Nobody reads or writes this from the app. The seed and teardown scripts run
-- as the service role, which bypasses RLS; leaving the table with RLS on and no
-- policy is what makes that the only way in.
