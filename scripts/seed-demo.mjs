// Fill weeks 1 to 4 with believable, disposable data.
//
//   DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/seed-demo.mjs [--batch <name>] [--weeks 1-4]
//
// The season's first four weeks are empty, so every board in the app is a blank
// slate and nothing can be judged by looking at it. This invents a cast of
// players and a plausible history for them.
//
// THE RULE: every row this writes is recorded in public.demo_seed, and
// scripts/clear-demo.mjs deletes exactly those rows and nothing else. "Delete
// anything that looks like test data" is not a plan — it guesses, and it
// guesses about the same tables real people will be using.
//
// Two things it deliberately does not do.
//
// It writes no contest_lines. Those are append-only by design (migration 0004:
// a frozen price is a historical record and the trigger refuses to delete one),
// so seeding them would leave a permanent trace. Grading reads the price stored
// on each pick, not the contest line, so putting the invented price there is
// both sufficient and reversible.
//
// And it does not grade. Weekly results, activity, achievements and standings
// are produced by running the real grading job afterwards, which is the point:
// the demo exercises the same code a real week does, instead of a second
// implementation that could flatter it.

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const BATCH = argOf('--batch') ?? `demo-${new Date().toISOString().slice(0, 10)}`;

// Declared up here, not beside priceGame: the body of this script is top-level
// await, so a const further down is still in its temporal dead zone when the
// helpers run.
const AVERAGE_TOTAL = 43.5;
const WEEKS = parseWeeks(argOf('--weeks') ?? '1-4');

const DEMO_PLAYERS = [
  { slug: 'marcus', username: 'marcusdeep', skill: 0.58, fighter: ['Iron Gate', 'bulwark', 'cobalt', 'Nothing gets past me.'] },
  { slug: 'dre', username: 'dretheedge', skill: 0.55, fighter: ['Nightfall', 'blitzer', 'violet', 'Blink and it is over.'] },
  { slug: 'tess', username: 'tessthearm', skill: 0.61, fighter: ['Cannon', 'gunslinger', 'gold', 'I only throw deep.'] },
  { slug: 'ruiz', username: 'ruizruns', skill: 0.52, fighter: ['Freight', 'juggernaut', 'ember', null] },
  { slug: 'kaye', username: 'kayeburner', skill: 0.57, fighter: ['Mach', 'streak', 'jade', 'Catch me.'] },
  { slug: 'obi', username: 'obicalls', skill: 0.49, fighter: ['The Wall', 'centurion', 'crimson', null] },
  { slug: 'sam', username: 'samsundays', skill: 0.54, fighter: ['Verdict', 'centurion', 'bone', null] },
  { slug: 'lu', username: 'luthelock', skill: 0.6, fighter: ['Padlock', 'bulwark', 'crimson', 'Lock of the week, every week.'] },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const connectionString = process.env.DATABASE_URL;

if (!connectionString || !url || !serviceKey) {
  console.error('DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
const auth = createClient(url, serviceKey, { auth: { persistSession: false } });

const counts = {};
function tally(what, n = 1) {
  counts[what] = (counts[what] ?? 0) + n;
}

/** Record a row so the teardown can find it again. Lower tiers delete first. */
async function remember(table, rowId, tier) {
  await db.query(
    `insert into public.demo_seed (batch, table_name, row_id, tier)
     values ($1, $2, $3, $4) on conflict (table_name, row_id) do nothing`,
    [BATCH, table, String(rowId), tier],
  );
}

await db.connect();

try {
  const { rows: leagues } = await db.query(
    `select id, name, season, lock_policy from public.leagues order by name`,
  );
  if (leagues.length === 0) throw new Error('no leagues to seed into');

  const season = leagues[0].season;
  console.log(`seeding batch ${BATCH} · season ${season} · weeks ${WEEKS.join(', ')}\n`);

  // --- The cast ---------------------------------------------------------------

  const players = [];
  for (const spec of DEMO_PLAYERS) {
    const email = `${spec.slug}@demo.sundayshowdown.test`;
    const { rows: existing } = await db.query(`select id from auth.users where email = $1`, [email]);

    let id = existing[0]?.id;
    if (!id) {
      const { data, error } = await auth.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { username: spec.username },
      });
      if (error) throw new Error(`creating ${email}: ${error.message}`);
      id = data.user.id;
      tally('players');
    }

    await remember('auth.users', id, 90);
    // The signup trigger writes the profile; make sure the name is the one the
    // boards should show either way.
    await db.query(`update public.profiles set username = $2 where user_id = $1`, [id, spec.username]);

    const [name, archetype, banner, taunt] = spec.fighter;
    await db.query(
      `insert into public.fighters (user_id, name, archetype, banner, taunt)
       values ($1,$2,$3,$4,$5)
       on conflict (user_id) do update set name = excluded.name, archetype = excluded.archetype,
         banner = excluded.banner, taunt = excluded.taunt`,
      [id, name, archetype, banner, taunt],
    );
    await remember('fighters', id, 85);

    players.push({ ...spec, id });
  }

  // Split across the leagues with a couple of overlaps, so the global board has
  // something to say that no single league table does.
  for (const [index, league] of leagues.entries()) {
    const mine = players.filter((_, i) => i % leagues.length === index || i < 2);
    for (const player of mine) {
      const { rowCount } = await db.query(
        `insert into public.league_members (league_id, user_id, role) values ($1,$2,'member')
         on conflict do nothing`,
        [league.id, player.id],
      );
      if (rowCount) tally('memberships');
      await remember('league_members', `${league.id}:${player.id}`, 70);
    }
  }

  // --- Weeks ------------------------------------------------------------------

  const scopes = [];

  for (const league of leagues) {
    const { rows: members } = await db.query(
      `select user_id from public.league_members where league_id = $1`,
      [league.id],
    );

    for (const week of WEEKS) {
      const { rows: games } = await db.query(
        `select id, home_abbr, away_abbr, home_score, away_score, start_time
           from public.nfl_games
          where season = $1 and week = $2 and status = 'final'
          order by start_time, id`,
        [season, week],
      );
      if (games.length === 0) {
        console.log(`  week ${week}: no final games, skipped`);
        continue;
      }

      const firstKickoff = games.reduce(
        (earliest, game) => (game.start_time < earliest ? game.start_time : earliest),
        games[0].start_time,
      );

      // The contest. A week that was never opened has none, so one is created
      // with the lock it should have had.
      const { rows: found } = await db.query(
        `select id, lock_time from public.pickem_challenges
          where league_id = $1 and season = $2 and week = $3`,
        [league.id, season, week],
      );

      let challengeId = found[0]?.id;
      const realLock = found[0]?.lock_time ?? firstKickoff;

      if (!challengeId) {
        const { rows: made } = await db.query(
          `insert into public.pickem_challenges
             (league_id, season, week, enabled_markets, lock_time)
           values ($1,$2,$3,$4,$5) returning id`,
          [league.id, season, week, ['moneyline', 'spread', 'total'], realLock],
        );
        challengeId = made[0].id;
        await remember('pickem_challenges', challengeId, 40);
        tally('contests');
      }

      // Picks on a locked week are refused by enforce_pick_lock, which is doing
      // exactly its job. Rather than disabling it — the lock is the rule the
      // whole competition rests on and it should not be switchable — the
      // contest's own lock is moved forward for the length of the insert and
      // put back immediately after. Nothing else can pick in that window: these
      // weeks are months past and the games are all final.
      const future = new Date(Date.now() + 3600_000).toISOString();
      await db.query(`update public.pickem_challenges set lock_time = $2 where id = $1`, [
        challengeId,
        future,
      ]);

      try {
        for (const member of members) {
          const player = players.find((p) => p.id === member.user_id);
          const skill = player?.skill ?? 0.55;
          const random = seeded(`${member.user_id}:${season}:${week}`);

          for (const game of games) {
            const market = pickMarket(random());
            const line = priceGame(game, random);
            const correct = random() < skill;
            const choice = select(market, line, game, correct, random);

            const { rowCount } = await db.query(
              `insert into public.picks
                 (user_id, league_id, challenge_id, game_id, season, week,
                  market_type, selection, selection_label, contest_line, contest_odds)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               on conflict (user_id, challenge_id, game_id) do nothing
               returning id`,
              [
                member.user_id, league.id, challengeId, game.id, season, week,
                market, choice.selection, choice.label, choice.line, choice.odds,
              ],
            );
            if (rowCount) {
              tally('picks');
              await remember('picks', `${member.user_id}:${challengeId}:${game.id}`, 10);
            }
          }
        }
      } finally {
        // Always, even if a pick failed: leaving a past week unlocked would let
        // anyone pick it.
        await db.query(`update public.pickem_challenges set lock_time = $2 where id = $1`, [
          challengeId,
          realLock,
        ]);
      }

      scopes.push({ leagueId: league.id, season, week });
      await remember('scope', `${league.id}:${season}:${week}`, 0);
    }
  }

  const { rows: pools } = await db.query(
    `select id from public.survivor_pools where season = $1`,
    [season],
  );

  // Membership is not a pick and carries no lock, so the pool at least has a
  // field in it.
  for (const pool of pools) {
    for (const player of players.slice(0, 6)) {
      const { rowCount } = await db.query(
        `insert into public.survivor_members (pool_id, user_id) values ($1,$2) on conflict do nothing`,
        [pool.id, player.id],
      );
      if (rowCount) tally('pool members');
      await remember('survivor_members', `${pool.id}:${player.id}`, 20);
    }
  }

  // --- Survivor picks are deliberately not seeded -------------------------------------
  //
  // A survivor pick locks on its own game's kickoff (migration 0027), so there
  // is no legitimate way to enter one for a week that has already been played —
  // which is the whole point of the rule, and it was a real hole until that
  // migration closed it. Backfilling survivor history would mean doing exactly
  // what a cheating player would do, so these weeks stay empty and Survivor
  // starts accumulating history from the current week onward.

  // --- A little noise in the channels ------------------------------------------

  const CHATTER = [
    'anyone else fade the chalk this week',
    'that total was never going over. never.',
    'i have had the same team four weeks running and it has lost four times',
    'locks of the week, go',
    'whoever took the dog in the late window, respect',
    'week is over for me, see you all monday',
    'genuinely the worst card i have ever submitted',
    'called it. screenshot it.',
  ];

  for (const league of leagues) {
    const { rows: channels } = await db.query(
      `select id from public.channels where league_id = $1 order by created_at limit 1`,
      [league.id],
    );
    if (channels.length === 0) continue;

    for (const [index, body] of CHATTER.entries()) {
      const author = players[index % players.length];
      const { rows: made } = await db.query(
        `insert into public.messages (channel_id, user_id, body, created_at)
         values ($1,$2,$3, now() - ($4 || ' hours')::interval) returning id`,
        [channels[0].id, author.id, body, String((CHATTER.length - index) * 7)],
      );
      tally('messages');
      await remember('messages', made[0].id, 10);
    }
  }

  console.log('\nseeded:');
  for (const [what, n] of Object.entries(counts)) console.log(`  ${n} ${what}`);
  console.log(`\nbatch: ${BATCH}`);
  console.log('\nNothing is graded yet. Run the grade job for each week to produce');
  console.log('standings, activity and achievements through the real code path:');
  for (const week of WEEKS) {
    console.log(`  curl -s -H "Authorization: Bearer $CRON_SECRET" \\`);
    console.log(`    "$APP_URL/api/cron/grade?season=${season}&week=${week}"`);
  }
  console.log(`\nTo remove all of it:  node scripts/clear-demo.mjs --batch ${BATCH}`);
} finally {
  await db.end();
}

// --- Helpers -----------------------------------------------------------------

function argOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1];
}

function parseWeeks(spec) {
  const range = spec.match(/^(\d+)-(\d+)$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  return spec.split(',').map(Number).filter(Number.isFinite);
}

/**
 * A deterministic generator, so running the seed twice produces the same cards.
 * Math.random would give a different history every time, which makes a bug in
 * anything downstream impossible to reproduce.
 */
function seeded(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Half-point precision, the way a book hangs a number. */
function round5(n) {
  return Math.round(n * 2) / 2;
}

/** Roughly how a real card is spread across the three markets. */
function pickMarket(r) {
  return r < 0.42 ? 'spread' : r < 0.74 ? 'moneyline' : 'total';
}

/**
 * Invent the line the book would have hung.
 *
 * Not the final margin. A closing spread is a forecast, and a bad one — real
 * NFL finals scatter around it by about two touchdowns — so deriving the line
 * straight from the score produced numbers no book has ever hung: SF -17,
 * Under 92.5. The margin is pulled most of the way back towards a pick'em and
 * the total towards the league average, which is roughly what a line is: the
 * middle, nudged.
 *
 * It also has to miss often enough to be interesting. A spread sitting exactly
 * on the final margin would push every time.
 */
function priceGame(game, r) {
  const margin = game.home_score - game.away_score;
  const scored = game.home_score + game.away_score;

  // A home spread is negative when the home side is favoured, so the sign flips.
  const expected = margin * 0.32 + (r() - 0.5) * 9;
  const spread = round5(clamp(-expected, -14.5, 14.5));

  const total = round5(
    clamp(AVERAGE_TOTAL + (scored - AVERAGE_TOTAL) * 0.3 + (r() - 0.5) * 6, 35.5, 54.5),
  );

  return { homeSpread: spread === 0 ? -0.5 : spread, total };
}

function clamp(n, low, high) {
  return Math.min(high, Math.max(low, n));
}


/** American price for a side, from the spread it is laid at. */
function moneylineFor(homeSpread, side) {
  const favourite = homeSpread < 0 ? 'home' : 'away';
  const size = Math.min(17, Math.abs(homeSpread));
  const price = Math.round(100 + size * 26);
  return side === favourite ? -Math.max(110, price) : Math.max(100, Math.round(price * 0.92));
}

/**
 * Choose a side, aiming to be right or wrong as instructed.
 *
 * The outcome is known — these are finished games — so "a 58% player" is
 * produced by deciding first whether this pick lands and then picking the side
 * that makes it so. A push is possible on a whole-number line and is left
 * alone: it is a real outcome and the grader handles it.
 */
function select(market, line, game, correct, r) {
  if (market === 'moneyline') {
    const homeWon = game.home_score > game.away_score;
    const selection = correct === homeWon ? 'home' : 'away';
    return {
      selection,
      label: `${selection === 'home' ? game.home_abbr : game.away_abbr} to win`,
      line: null,
      odds: moneylineFor(line.homeSpread, selection),
    };
  }

  if (market === 'spread') {
    const homeCovers = game.home_score - game.away_score + line.homeSpread > 0;
    const selection = correct === homeCovers ? 'home' : 'away';
    const value = selection === 'home' ? line.homeSpread : -line.homeSpread;
    return {
      selection,
      label: `${selection === 'home' ? game.home_abbr : game.away_abbr} ${value > 0 ? '+' : ''}${value}`,
      line: value,
      odds: -110 + Math.round((r() - 0.5) * 20),
    };
  }

  const wentOver = game.home_score + game.away_score > line.total;
  const selection = correct === wentOver ? 'over' : 'under';
  return {
    selection,
    label: `${selection === 'over' ? 'Over' : 'Under'} ${line.total}`,
    line: line.total,
    odds: -110 + Math.round((r() - 0.5) * 20),
  };
}
