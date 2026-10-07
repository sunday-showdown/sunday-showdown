-- Six team colours, because there are six sets of art.
--
-- A banner used to be a gradient drawn behind a vector figure, so the list of
-- them cost nothing. They are now a repainted copy of every character — the
-- kit is recoloured per banner and shipped as a file — so the palette is fixed
-- by what exists on disk, and 'bone' has no art behind it.
--
-- Mapped to gold, which is the closest of the six that remain.

update public.fighters set banner = 'gold' where banner = 'bone';

update public.fighters
   set banner = 'crimson'
 where banner not in ('crimson', 'gold', 'jade', 'cobalt', 'violet', 'ember');
