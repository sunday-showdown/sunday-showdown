# Sunday Showdown

A private NFL pick'em app for a friend group. One pick per game — moneyline,
spread or the total — locking at the first Sunday kickoff and settling itself
from ESPN's free data feed.

Every pick is scored as a $10 bet and pays what the odds pay, which is the one
rule the whole competition rests on. The reasoning is in `lib/odds.ts`.

Next.js on Vercel, Postgres on Supabase, no paid services.

## Status

Built:

- **Pick'em** — the full loop: schedule, odds, picking, locking, line freezing, grading, standings, career stats
- **Other modes** — Survivor, TD Scorer, head-to-head, playground, each with its own pot
- **Chat** — league channels, a room per mode, direct messages, images, GIFs, reactions, @mentions, live over Supabase realtime
- **Shared bet slips** — post what you placed at a book; the league tails or fades it
- **Bet tracker** — log what you place and see units, ROI, win rate, streak, and a split by book and by singles vs parlays
- **Shared cards** — post your week's card into a channel and watch it grade itself there
- **Highlights** — the generated feed of winners, upsets and streaks
- **Auth** — email/password, email confirmation, password reset
- **Leagues** — create, invite code, join, members, picture, commissioner rules
- **Sign-in** — email and password, plus Apple and Google when configured (§2c)
- **Notifications** — in-app bell and web push
- **PWA** — installable, read-only offline for standings and profile

Optional and off by default: GIF **search**, which needs a free Tenor key —
sending a GIF as a file works without one. Setup is in §2b.

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
| `TENOR_API_KEY` | optional — Google Cloud, with the Tenor API enabled |

Two of these are optional and the app degrades rather than breaks without
them. With no VAPID keys, `pushToUsers` reports `skipped` and everything else
runs normally. With no Tenor key, `/api/gifs` reports `configured: false`, the
picker says GIF search is switched off, and GIFs still send as file uploads.

### 2b. GIF search (optional)

Chat sends GIFs with no key at all — the attach button uploads a `.gif` like any
other image. **Search** is the part that needs one, because Tenor is the only
free GIF index and it requires a key, which cannot live in the browser.

It is free, takes about two minutes, and needs no card:

1. Go to **console.cloud.google.com** and sign in.
2. Create a project, or pick an existing one, from the dropdown at the top.
3. Open **APIs & Services → Library**, search for **Tenor API**, open it and
   press **Enable**.
4. Go to **APIs & Services → Credentials → Create credentials → API key**.
5. Copy the key. Optionally press **Edit API key** and, under *API
   restrictions*, restrict it to the Tenor API — worth doing, since the key is
   only ever used for this.

Then put it in two places:

```bash
echo 'TENOR_API_KEY=your-key-here' >> .env.local
npx vercel env add TENOR_API_KEY
```

Until it exists, `/api/gifs` replies `configured: false`, the picker says search
is switched off and points at the attach button, and nothing errors.

### 2c. Apple and Google sign-in (optional, recommended)

Email and password works out of the box. Social sign-in is worth switching on
anyway: the slowest part of getting a friend into a league is the confirmation
email, and this skips it entirely.

The app reads `/auth/v1/settings` from Supabase and shows a button only for a
provider that is actually enabled, so there is nothing to change in the code —
turn one on and the button appears.

**Google** — about five minutes:

1. **console.cloud.google.com → APIs & Services → OAuth consent screen.** Pick
   *External*, fill in the name and your email, and save. It can stay in
   *Testing* while it is you and your friends.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. Under *Authorised redirect URIs* add the callback Supabase shows you, which
   is `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Copy the client ID and secret into **Supabase → Authentication → Providers →
   Google**, and enable it.

**Apple** — needs a paid Apple Developer account ($99/year). If you do not have
one, Google alone is fine. Otherwise: create a Services ID, enable *Sign in
with Apple*, add the same Supabase callback URL, generate a key, and paste the
Services ID and the key into **Supabase → Authentication → Providers → Apple**.

Then, for either, add your app's URLs under **Supabase → Authentication → URL
Configuration → Redirect URLs**:

```
http://localhost:3000/auth/callback
https://sundayshowdown.vercel.app/auth/callback
https://sunday-showdown-navy.vercel.app/auth/callback
```

A profile is created automatically for a social sign-in, with a username taken
from the email address. People can rename themselves afterwards.

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

Push to GitHub, import the repo in Vercel, and add the same environment
variables for Production, Preview and Development — all of them except
`DATABASE_URL`, which stays local.

Chat attachments need a public storage bucket called `chat-media`. Migration
0013 creates it, but on some projects `storage.objects` belongs to
`supabase_storage_admin` and the migration prints a warning instead; if it did,
create the bucket in the dashboard as **public**. Uploads go through
`/api/uploads` with the service role either way, which is where the file type
and size are actually checked.

### 6. Scheduling

**Vercel's Hobby plan allows cron jobs only once per day**, and a more frequent
expression fails the deployment. So the schedule lives in GitHub Actions
(`.github/workflows/cron.yml`) instead, which is free and runs every 10 minutes.

Add two repository secrets under Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `APP_URL` | your deployment URL, no trailing slash — `https://sundayshowdown.vercel.app` |
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

## Where it lives

Two URLs, both serving the same deployment:

| URL | |
|---|---|
| `sundayshowdown.vercel.app` | the one to share |
| `sunday-showdown-navy.vercel.app` | the original, kept so older invite links still work |

`sunday-showdown.vercel.app` belongs to a different Vercel account — `.vercel.app`
subdomains are global — which is where the `-navy` suffix came from in the first
place. The second domain was added alongside rather than by renaming the
project, so nothing already shared broke.

Nothing in the code knows either name. Invite links, OAuth redirects and share
sheets all build from `window.location.origin`, so adding or changing a domain
needs no deploy. The two places that do know are the `APP_URL` repository secret,
which the cron workflow calls, and Supabase's redirect allow-list.

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

**No sportsbook feed exists for a person's own bets.** No US book publishes an
API that would let an app read somebody's wagers, and none offers a public deep
link that pre-builds one. Both are partner-only. So shared slips and the bet
tracker are both fed by hand: the app's job is to make entry quick and then do
the arithmetic — units and ROI rather than a count of wins, since "up $400"
means nothing without the bet size. `lib/betStats.ts` has the maths.

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
| One pot per league, season and mode | `pots_one_per_mode_idx`, migration 0013 |
| A message cannot change author, channel or attachment | `enforce_message_immutability` trigger |
| A direct message has one conversation per pair | `dm_key` unique, set by `open_dm` |
| When picks lock follows the league's rule | `pick_lock_time` + `enforce_pick_lock` |
| Only a pot's owner confirms a payment | `enforce_pot_payment_authority` trigger |
| A commissioner cannot rewrite league counters | column grants, migration 0020 |
| `member_count` cannot drift | `recount_league_members` trigger |
| Users cannot rewrite a message's provenance | column grants, migration 0013 |

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
