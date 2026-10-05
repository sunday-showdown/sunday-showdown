# Sunday Showdown

A private NFL pick'em app for a friend group. One pick per game — moneyline
(+1), spread (+5) or the total (+5) — locking at the first Sunday kickoff and
settling itself from ESPN's free data feed.

Next.js on Vercel, Postgres on Supabase, no paid services.

## Status

Built and complete:

- **Pick'em** — the full loop: schedule, odds, picking, locking, line freezing, grading, standings, career stats
- **Auth** — email/password, email confirmation, password reset
- **Leagues** — create, invite code, join, commissioner role
- **PWA** — installable, read-only offline for standings and profile

Schema exists but **no UI or jobs yet**: TD Scorer, Survivor, head-to-head,
playground, social feed, notifications, pots. The tables, constraints and RLS
policies for all of them are in `supabase/migrations`, so they can be built
without further schema work.

Not built: push notifications.

## Setup

### 1. Supabase

Create a free project at supabase.com, then run the migrations **in order**.
Either paste each file into the SQL editor, or use the CLI:

```bash
npx supabase link --project-ref <your-project-ref> && npx supabase db push
```

Migrations are ordered and must be applied in sequence — later ones depend on
types and functions created by earlier ones.

### 2. Environment

If the project is already deployed, pull everything rather than retyping it:

```bash
npx vercel link && npx vercel env pull .env.local --environment=development
```

That fetches every runtime variable. **`DATABASE_URL` is not among them** — it
is deliberately absent from Vercel, since it carries the database password and
is only used to run migrations. Add it by hand:

```
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

Setting up fresh instead? Copy `.env.example` to `.env.local` and fill it in:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → Data API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret key — **server only, never expose** |
| `CRON_SECRET` | any long random string you generate |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"` |
| `VAPID_SUBJECT` | `mailto:` your address |

Push is optional: with no VAPID keys, `pushToUsers` reports `skipped` and
everything else runs normally.

### 3. Run it

```bash
npm install && npm run dev
```

### 4. Seed the data

The cron routes are also callable by hand. With the dev server running:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-games
```

That writes the 32 teams, the current week's schedule and its odds. Then open
contests and freeze anything already locked:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/contests
```

Order matters the first time: `sync-games` seeds `nfl_teams`, which
`nfl_games` references, and `contests` needs a slate to compute a lock time
from.

### 5. Deploy

Push to GitHub, import the repo in Vercel, and add the same four environment
variables for Production, Preview and Development.

### 6. Scheduling

**Vercel's Hobby plan allows cron jobs only once per day**, and a more frequent
expression fails the deployment. So the schedule lives in GitHub Actions
(`.github/workflows/cron.yml`) instead, which is free and runs every 10 minutes.

Add two repository secrets under Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `APP_URL` | your deployment URL, no trailing slash — `https://your-app.vercel.app` |
| `CRON_SECRET` | the same value as the Vercel environment variable |

| Job | Does |
|---|---|
| `/api/cron/sync-games` | teams, schedule, scores, odds |
| `/api/cron/contests` | open weeks, advance league week, freeze locked lines |
| `/api/cron/grade` | grade settled picks, rebuild standings and career stats |

All three are idempotent, so a delayed or repeated run is harmless. GitHub
disables scheduled workflows after 60 days without repository activity — if the
app goes quiet in the offseason, re-enable it under the Actions tab.

On a Vercel Pro plan, delete the workflow and move the schedules into
`vercel.json` as a `crons` array; Vercel's scheduler is more reliable.

## Data

Everything comes from one free, keyless endpoint:

```
site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
```

It carries schedule, live scores, final results and DraftKings lines for all
three markets. Two behaviours worth knowing:

- **Odds disappear at kickoff.** An empty odds array means the game started, not
  that lines were withdrawn. `lib/espn/sync.ts` preserves captured lines rather
  than deactivating them.
- **Values are strings.** `"-9.5"`, `"+400"`, `"o47.5"`. `lib/espn/parse.ts`
  handles the coercion, including `PK` and `EVEN`.

ESPN publishes no anytime-TD player props, which is why TD Scorer point values
are derived from season production (`derive_td_point_value` in migration 0005)
with a commissioner override.

## Rules enforced by the database

These are competition-critical, so they are constraints and triggers rather than
application checks — application code can be bypassed, as it was in the previous
build.

| Rule | Mechanism |
|---|---|
| One market per game, mutually exclusive | `unique (user_id, challenge_id, game_id)` on `picks` |
| Game status never regresses | `enforce_game_status_progression` trigger |
| Frozen lines immutable, undeletable | `enforce_contest_line_immutability` trigger |
| Lock covers insert, update **and** delete | `enforce_pick_lock` + `enforce_pick_delete_lock` |
| A final game must have scores | `nfl_games_final_has_scores` check |
| Grading uses the stored line, never live odds | `contest_line` snapshotted on the pick |
| Users cannot grant themselves admin | column grants, migration 0009 |

Grading is idempotent: career stats are recomputed from `picks`, never
incremented, so a re-run after a score correction produces the same numbers.

## Adding a feature

Setup is one-time. Normal changes are just:

```bash
npm test && git add -A && git commit -m "..." && git push
```

Vercel deploys every push to `main` automatically. CI runs typecheck, tests and
a production build first, so a broken build is visible before it matters. To
roll back: Vercel → Deployments → ⋯ → Promote to Production on the last good one.

**If the change needs new tables or columns**, add `supabase/migrations/0010_*.sql`
and run `npm run migrate` once. Applied files are tracked in `schema_migrations`
and skipped on re-runs.

Keep migrations **additive** — new tables, new nullable columns. Vercel preview
deployments inherit production environment variables, so they read and write the
**production database**; a `drop column` or a destructive `alter` run while
testing a branch hits real data. If you need a destructive change, create a
second free Supabase project as staging first and point a preview environment at
it.

Three rules worth keeping, because the app's integrity rests on them:

- Pick writes go through the API route, never straight from the browser to the
  table. The route is what resolves the line server-side.
- Anything competition-critical gets a database constraint or trigger, not just
  an application check. Application code can be bypassed; the previous build's
  `PickSheet` is proof.
- Grading must stay idempotent. Recompute totals from `picks`; never increment.

## Tests

```bash
npm test
```

Covers the money paths — odds parsing, grading, ranking, the weekly lock, pick
validation, status progression. Fixtures are real payload shapes captured from
the live ESPN endpoint, not invented ones.

CI runs typecheck, tests and a production build on every push and pull request.
