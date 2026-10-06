-- Remove the old touchdown model from the database.
--
-- It priced Derrick Henry at -900 — a nine-in-ten chance of scoring, which no
-- sportsbook has ever printed for a touchdown prop. Three defects produced it,
-- and all three are fixed in lib/td-model.ts:
--
--   * it used a scoring RATE where a PROBABILITY belongs. Seven touchdowns in
--     four games is 1.75 a game, but "scores at least once" cannot exceed 1.
--     The replacement uses the Poisson relation, 1 - e^(-λ);
--   * games played was (week - 1) for everybody, so somebody who had missed a
--     month carried the same denominator as an ever-present starter. It is now
--     the team's completed games, with a usage signal standing in for an
--     individual absence;
--   * nothing about the opponent, which is most of what moves a real line.
--
-- These functions are already unreferenced: no trigger, constraint or default
-- calls them, and the application stopped importing their TypeScript twins in
-- the same change. Dropping them matters anyway — a second, wrong model left
-- sitting in the schema is one somebody calls by accident in a year's time.

drop function if exists public.derive_td_points(integer, integer);
drop function if exists public.td_scoring_probability(integer, integer);
drop function if exists public.td_tier_for(integer, integer);

-- Usage is what separates a scoreless WR1 from a fourth receiver, and the old
-- column name for it meant something narrower than what is now stored.
comment on column public.player_season_stats.rushing_attempts is
  'Carries plus receptions: the usage signal for touchdown pricing. Carries are estimated from rushing yards, since ESPN publishes no attempts category in the leaders payload.';
