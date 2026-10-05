-- A message that is somebody's card.
--
-- On its own because of a Postgres rule: a value added to an enum cannot be
-- used in the same transaction that added it, and the migration runner puts
-- each file in its own transaction. So this file adds the value and 0016 uses
-- it. Merging the two would fail on a fresh database and pass on this one,
-- which is the worst kind of migration.

alter type message_kind add value if not exists 'pick_card';
