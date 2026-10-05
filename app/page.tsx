import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect('/home');

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-16 safe-top">
      <header className="flex items-center justify-between py-3">
        <Wordmark />
        <Link href="/login" className="text-sm font-semibold text-muted hover:text-ink">
          Sign in
        </Link>
      </header>

      <section className="pt-10">
        <h1 className="display text-[2.8rem] leading-[0.92]">
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

      <section className="mt-14">
        <div className="card p-5">
          <h2 className="display text-[19px] leading-none">
            Every pick is a <span className="text-brand">$10 bet</span>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            You score what it pays. Take a heavy favourite and you bank a few
            points. Take a long shot and it&apos;s worth a lot more — if it lands.
          </p>

          <div className="mt-4 space-y-2">
            <Payout odds="−600" pays="+12" label="Heavy favourite" />
            <Payout odds="−110" pays="+19" label="Spread or total" />
            <Payout odds="+400" pays="+50" label="Big underdog" />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            No pick is a free ride and none is a trap — every option is worth
            about the same on average. Points come from being right, not from
            working out which button is worth more.
          </p>
        </div>
      </section>

      <section className="card mt-10 p-5">
        <h2 className="display text-[19px] leading-none">How a week works</h2>
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

function Payout({ odds, pays, label }: { odds: string; pays: string; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-raised px-4 py-2.5">
      <span className="text-sm text-muted">
        <span className="tabnum font-semibold text-ink">{odds}</span>
        <span className="ml-2">{label}</span>
      </span>
      <span className="display text-[19px] leading-none tabnum text-brand">{pays}</span>
    </div>
  );
}
