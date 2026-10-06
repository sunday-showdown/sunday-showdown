// Remove everything scripts/seed-demo.mjs created.
//
//   DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/clear-demo.mjs [--batch <name>] [--all] [--dry-run]
//
// Works from the ledger in public.demo_seed, never from a guess about what
// looks fake. Rows are deleted in tier order — picks before contests, members
// before the accounts they belong to — because the foreign keys are there on
// purpose and deleting in the wrong order is how half of a teardown gets left
// behind.
//
// Grading's output is handled separately. Weekly results, activity, achievements
// and notifications are not seeded rows; they are produced from the seeded picks
// by the real grading job, so they are not in the ledger and have to be cleared
// by the week they belong to. The seed records those weeks as `scope` entries
// for exactly this purpose.
//
// Career totals on surviving profiles are recomputed from the picks table by
// every grading run, so they are zeroed here and rebuild themselves on the next
// one rather than being left reading as though the demo had happened.

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const BATCH = argOf('--batch');
const ALL = process.argv.includes('--all');
const DRY = process.argv.includes('--dry-run');

if (!BATCH && !ALL) {
  console.error('Pass --batch <name> to remove one seed run, or --all for every one.');
  console.error('Add --dry-run to see what would go without touching anything.');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!connectionString || !url || !serviceKey) {
  console.error('DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
const auth = createClient(url, serviceKey, { auth: { persistSession: false } });

/** How a ledger row turns into a delete. Composite ids are joined with ':'. */
const DELETERS = {
  picks: (id) => ['delete from public.picks where user_id=$1 and challenge_id=$2 and game_id=$3', id.split(':')],
  survivor_picks: (id) => {
    const [pool, user, week] = id.split(':');
    return ['delete from public.survivor_picks where pool_id=$1 and user_id=$2 and week=$3', [pool, user, Number(week)]];
  },
  messages: (id) => ['delete from public.messages where id=$1', [id]],
  survivor_members: (id) => ['delete from public.survivor_members where pool_id=$1 and user_id=$2', id.split(':')],
  pickem_challenges: (id) => ['delete from public.pickem_challenges where id=$1', [id]],
  league_members: (id) => ['delete from public.league_members where league_id=$1 and user_id=$2', id.split(':')],
  fighters: (id) => ['delete from public.fighters where user_id=$1', [id]],
  // h2h_rounds go with their challenge: the foreign key cascades.
  h2h_challenges: (id) => ['delete from public.h2h_challenges where id=$1', [id]],
  follows: (id) => ['delete from public.follows where follower_id=$1 and following_id=$2', id.split(':')],
};

await db.connect();

try {
  const { rows: ledger } = await db.query(
    ALL
      ? `select batch, table_name, row_id, tier from public.demo_seed order by tier, table_name`
      : `select batch, table_name, row_id, tier from public.demo_seed where batch = $1 order by tier, table_name`,
    ALL ? [] : [BATCH],
  );

  if (ledger.length === 0) {
    console.log('Nothing recorded for that batch. Nothing to remove.');
    process.exit(0);
  }

  const scopes = ledger
    .filter((row) => row.table_name === 'scope')
    .map((row) => {
      const [leagueId, season, week] = row.row_id.split(':');
      return { leagueId, season: Number(season), week: Number(week) };
    });

  const byTable = {};
  for (const row of ledger) byTable[row.table_name] = (byTable[row.table_name] ?? 0) + 1;

  console.log(`${ledger.length} recorded rows across ${Object.keys(byTable).length} tables:`);
  for (const [table, n] of Object.entries(byTable)) console.log(`  ${n} ${table}`);
  console.log(`covering ${scopes.length} league-weeks\n`);

  if (DRY) {
    console.log('--dry-run: nothing deleted.');
    process.exit(0);
  }

  await db.query('begin');

  // 1. Everything grading derived from the seeded weeks.
  let derived = 0;
  for (const scope of scopes) {
    for (const [sql, params] of [
      ['delete from public.weekly_results where league_id=$1 and season=$2 and week=$3', [scope.leagueId, scope.season, scope.week]],
      ['delete from public.league_activity where league_id=$1 and season=$2 and week=$3', [scope.leagueId, scope.season, scope.week]],
      [`delete from public.notifications where notification_key like $1`, [`weekly:${scope.season}:${scope.week}:%`]],
      [`delete from public.notifications where notification_key like $1`, [`lock:${scope.season}:${scope.week}:%`]],
    ]) {
      const { rowCount } = await db.query(sql, params);
      derived += rowCount;
    }
  }
  console.log(`derived rows removed: ${derived}`);

  // 2. A locked week refuses to give its picks up — enforce_pick_delete_lock,
  //    which is right: a settled pick is a record and a player must not be able
  //    to remove one. The lock is a property of the contest, so each affected
  //    contest's lock is moved forward for the length of this transaction and
  //    put back at the end. The trigger stays armed throughout, and a failure
  //    anywhere rolls the whole thing back with the real locks intact.
  const unlocked = [];
  for (const scope of scopes) {
    const { rows } = await db.query(
      `select id, lock_time from public.pickem_challenges
        where league_id = $1 and season = $2 and week = $3`,
      [scope.leagueId, scope.season, scope.week],
    );
    for (const contest of rows) {
      unlocked.push(contest);
      await db.query(`update public.pickem_challenges set lock_time = $2 where id = $1`, [
        contest.id,
        new Date(Date.now() + 3600_000).toISOString(),
      ]);
    }
  }

  // 3. The recorded rows, children first.
  let removed = 0;
  const accounts = [];

  for (const row of ledger) {
    if (row.table_name === 'scope') continue;

    if (row.table_name === 'auth.users') {
      accounts.push(row.row_id);
      continue;
    }

    const build = DELETERS[row.table_name];
    if (!build) {
      console.warn(`  no deleter for ${row.table_name}, left in place`);
      continue;
    }
    const [sql, params] = build(row.row_id);
    const { rowCount } = await db.query(sql, params);
    removed += rowCount;
  }
  console.log(`seeded rows removed: ${removed}`);

  // Locks back on, for every contest that outlived the teardown.
  for (const contest of unlocked) {
    await db.query(
      `update public.pickem_challenges set lock_time = $2 where id = $1`,
      [contest.id, contest.lock_time],
    );
  }

  // 4. Anything still pointing at a demo account, before the account goes.
  for (const id of accounts) {
    await db.query('delete from public.h2h_rounds where challenge_id in (select id from public.h2h_challenges where challenger_id=$1 or opponent_id=$1)', [id]);
    await db.query('delete from public.h2h_challenges where challenger_id=$1 or opponent_id=$1', [id]);
    await db.query('delete from public.picks where user_id=$1', [id]);
    await db.query('delete from public.survivor_picks where user_id=$1', [id]);
    await db.query('delete from public.messages where user_id=$1', [id]);
    await db.query('delete from public.weekly_results where user_id=$1', [id]);
  }

  // 5. Career totals on the accounts that survive. Grading recomputes these
  //    from the picks table, so zeroing is safe: the next run rebuilds them
  //    from whatever genuinely remains.
  const touched = [...new Set(ledger.filter((r) => r.table_name === 'league_members').map((r) => r.row_id.split(':')[1]))];
  if (touched.length > 0) {
    await db.query(
      `update public.profiles set
         career_pickem_wins = 0, career_pickem_losses = 0, career_pickem_pushes = 0,
         career_ml_wins = 0, career_ml_losses = 0,
         career_spread_wins = 0, career_spread_losses = 0,
         career_total_wins = 0, career_total_losses = 0,
         current_pickem_streak = 0, longest_pickem_streak = 0,
         weekly_wins_count = 0
       where user_id = any($1::uuid[])`,
      [touched],
    );
  }

  await db.query(
    ALL ? 'delete from public.demo_seed' : 'delete from public.demo_seed where batch = $1',
    ALL ? [] : [BATCH],
  );

  await db.query('commit');

  // 6. The accounts themselves, through the auth API. Outside the transaction
  //    because it is a different system; the profile row cascades with it.
  let deletedAccounts = 0;
  for (const id of accounts) {
    const { error } = await auth.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) {
      console.warn(`  could not delete account ${id}: ${error.message}`);
      continue;
    }
    deletedAccounts += 1;
  }
  console.log(`demo accounts removed: ${deletedAccounts}`);

  console.log('\nDone. Run the grade job once to rebuild career totals from what is left.');
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}

function argOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1];
}
