# Sunday Showdown — product and code review

A pass over the whole app, written as notes to act on. Measurements were taken
on an emulated 375×812 phone against the live database, not estimated.

---

## Verdict

**The engineering is not the problem.** First-load JS is 103–118kB across every
route, there are 476 tests, the competition rules are enforced as database
constraints and triggers rather than application checks, and RLS covers every
table. That is a sound foundation.

**The problem is density and breadth.** The app asks a lot of a glance. The
"too busy" feedback is real and it is concentrated in a small number of places,
which is good news — it is fixable without rebuilding anything.

| Screen | Height | Tap targets | Section headings |
|---|---|---|---|
| **/picks** | **5.8 screens** | **116** | 1 |
| /survivor | 3.4 screens | 42 | 4 |
| /profile | 2.3 screens | 15 | 5 |
| /home | 2.1 screens | 19 | 5 |

And structurally: **26 routes, 9 game modes, 5 nav tabs.**

---

## Fixed in this pass

**1. The pick button carried three values where one does the work.**
Every option showed its label, a payout pill reading "19 pts", and the book
price underneath. Six buttons a game across fifteen games is roughly **270
figures on one screen**, and two of the three say the same thing — the payout is
derived from the price. The payout survives, because the competition is scored
in it; the price returns on the option you actually chose, where it is one line
per game instead of six.

**2. Tap targets below the 44pt minimum: 18 → 0.**
The week selector was a row of eighteen 36×36 buttons — small targets in a
horizontally scrolling row, which is exactly where a thumb misses, because the
row moves under it.

**3. Home was taking 2.1 seconds and is now 0.6.**
It called `loadRecap` to render a three-number banner. That function pulls every
pick with its game, every duel, the survivor rows and the TD card — right for the
recap screen, absurd for a strip. `loadRecapSummary` does the same job in three
queries that do not join.

**4. No loading, error or not-found boundaries existed anywhere.**
Every route is `force-dynamic` and does real database work, so a tab could take
a second or more while Next held the *previous* screen on display — the app read
as frozen. There is now a skeleton, an error screen inside the app's own chrome
with a retry, and a not-found. `notFound()` was already being called by the
matchup page with nothing to catch it.

**5. Removed `components/LeagueCards.tsx`** — dead since Home moved to
`LeagueWeekCard`.

---

## Changes I would make next, highest value first

### 1. Cut Home from five sections to three
Home has five competing headings: recap, Your weeks, Up next, You're playing,
Game modes. The first four are *your state*. The fifth is a menu, and a menu
competing with your state is what makes the screen feel like a directory.

> Move "Game modes" behind a single row — "All modes →" — or onto the profile
> screen beside the links that already live there. Nobody browses modes daily;
> they go to the one they are in, which "You're playing" already shows.

### 2. Group the slate by kickoff window
Fifteen games in one flat list is a wall regardless of how clean each card is.
Real slates have natural breaks: Thursday, Sunday early, Sunday late, Sunday
night, Monday. Four collapsible groups with a count and a lock time each turns
one 5.8-screen list into four short ones, and matches how people think about a
week.

### 3. Collapse the week selector
Eighteen buttons are permanently on screen to serve a choice almost nobody makes
— you want this week. Show the current week with a chevron, expand on tap.

### 4. Reconsider three markets × two sides per game
Six equal-weight buttons a game is the densest thing in the app. Worth testing a
default of one market with a segmented toggle (ML / Spread / Total) above the
slate, which would cut visible options per game from six to two. This is a
behavioural question, not a taste one — worth checking whether people actually
spread their picks across markets before committing.

### 5. Name one thing one way
The feature is "Duels" in the UI, `h2h` in the route and `h2h_challenges` in the
database, while the *app* is called Showdown. Pick one word for the user-facing
concept and let the schema keep its own.

### 6. "Your run" on Survivor duplicates the roster
Your own row in the field already shows your used teams and status. The separate
strip above it says the same thing twice.

---

## Removals worth considering

| Thing | Why | Risk |
|---|---|---|
| **Playground** | One card ever created. It has no clear loop — no scoring, no stakes, no deadline — and it costs a mode slot, a route, a pot, a chat room and a tile. | Low. Delete or fold into Duels. |
| **TD Scorer's separate board** | Zero TD picks ever made. The model behind it is good; the question is whether it earns a top-level mode or belongs as a bonus line on the pick'em card. | Medium — it is a genuinely distinctive feature, just unproven. |
| **The `/pot` and `/standings` routes** | Already reduced to nine-line redirect stubs. | **Keep them.** They protect saved home-screen shortcuts. |

Nine modes is the root of the breadth problem. Pick'em, Survivor and Duels are
the three with a real loop. Everything else is a candidate for folding in.

---

## Debt and risk

- **Demo data is in the production database.** Eight demo accounts, 832 picks,
  four graded weeks. All tracked in `demo_seed` and removable with
  `node scripts/clear-demo.mjs --all`, but it is still there, and the two test
  accounts with it.
- **84 art files, ~10MB.** The cost of six characters × six colours × two sizes.
  Fine today; worth moving to a CDN or converting to WebP before the roster grows.
- **No analytics.** There is no way to answer "does anyone use Playground" except
  by querying the database by hand, which is how the two removal candidates above
  were found. A handful of events would make these decisions evidence-based.
- **Grading is a single cron.** If it fails silently on a Tuesday, nobody knows
  until somebody opens the app. `sync_logs` records it; nothing reads that.

---

## What is genuinely good, and worth protecting

- **The scoring rule.** "Every pick is a $10 bet and you score what it pays" is
  the one idea that makes this different from every other pick'em, and it is
  mathematically honest — equivalent bets pay equally, so no market is
  exploitable.
- **The database holds the competition rules.** Lock times, line freezing, pick
  immutability and the survivor lock are constraints and triggers. Application
  code can be bypassed; these cannot.
- **The duel.** Converting a week's points into a fight is the most engaging
  thing in the app and the hardest to copy.
