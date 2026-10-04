import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect('/home');

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-16 safe-top">
      <header className="flex items-center justify-between py-3">
        <span className="font-display text-lg font-extrabold tracking-tight">
          Sunday<span className="text-brand">Showdown</span>
        </span>
        <Link href="/login" className="text-sm font-semibold text-muted hover:text-ink">
          Sign in
        </Link>
      </header>

      <section className="pt-10">
        <h1 className="font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight">
          Beat your friends.
          <br />
          <span className="text-brand">Every Sunday.</span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          One pick per game. Moneyline, spread or the total — you choose which,
          and you only get one. Lines lock at the first Sunday kickoff and
          everything settles itself.
        </p>

        <Link href="/signup" className="btn-primary mt-7 h-14 w-full text-base">
          Create your league
        </Link>
        <p className="mt-3 text-center text-xs text-muted">
          Free, no ads, no real money. Just bragging rights.
        </p>
      </section>

      <section className="mt-14 space-y-3">
        <Rule
          points="+1"
          title="Moneyline"
          body="Just pick the winner. Safe, and priced like it."
        />
        <Rule
          points="+5"
          title="Spread"
          body="Take the points or give them. Worth five times as much."
        />
        <Rule
          points="+5"
          title="Over / Under"
          body="Call the combined score. Same reward, different read."
        />
      </section>

      <section className="card mt-10 p-5">
        <h2 className="font-display text-lg font-bold">How a week works</h2>
        <ol className="mt-4 space-y-4">
          {([
            ['Pick', 'Choose one market per game. Change your mind as often as you like until lock.'],
            ['Lock', 'At the first Sunday kickoff every card freezes, and the lines you took are kept exactly as they were.'],
            ['Settle', 'Scores arrive automatically. Points, standings and streaks update without anyone doing anything.'],
          ] as const).map(([title, body], index) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                {index + 1}
              </span>
              <div>
                <div className="text-sm font-semibold">{title}</div>
                <div className="mt-0.5 text-sm leading-relaxed text-muted">{body}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 text-center">
        <p className="text-sm text-muted">Already in a league?</p>
        <Link href="/login" className="btn-ghost mt-3 h-12 w-full">
          Sign in
        </Link>
      </section>
    </main>
  );
}

function Rule({ points, title, body }: { points: string; title: string; body: string }) {
  return (
    <div className="card flex items-start gap-4 p-4">
      <span className="font-display shrink-0 text-xl font-extrabold tabnum text-brand">
        {points}
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-sm leading-relaxed text-muted">{body}</div>
      </div>
    </div>
  );
}
