import Link from 'next/link';

// The game modes, and only those.
//
// This grid used to be called "More ways to play" and held ten tiles, half of
// which were not ways to play anything: Friends, Leagues, the week recap, the
// highlights feed and the bet tracker are places you go, not games you enter.
// Lumping them in made the section mean nothing and made the five real modes
// harder to find among them. The rest now live on the profile screen, which is
// where everything else about *you* already is.
//
// "Pot" was removed from this list earlier for the same kind of reason: a pot
// belongs to a competition, not to the league in general, so each mode carries
// its own. See lib/pot.ts.
const MODES = [
  { href: '/live', title: 'Live', blurb: 'Watch your card settle.', icon: '📡', tint: 'bg-live/15' },
  { href: '/survivor', title: 'Survivor', blurb: 'One team a week. Never twice.', icon: '🛡️', tint: 'bg-win/15' },
  { href: '/td', title: 'TD Scorer', blurb: 'Call the end zone.', icon: '🏈', tint: 'bg-brand/15' },
  { href: '/h2h', title: 'Duels', blurb: 'Fight a friend, week or season.', icon: '⚔️', tint: 'bg-gold/15' },
  { href: '/calls', title: 'Calls', blurb: 'Back it publicly. Be held to it.', icon: '📣', tint: 'bg-brand/15' },
] as const;

export default function ModesHub() {
  return (
    <section className="mt-5">
      <h2 className="eyebrow px-4 pb-2">Game modes</h2>
      <div className="grid grid-cols-2 gap-2 px-4">
        {MODES.map((mode) => (
          <Link
            key={mode.href}
            href={mode.href}
            className="card flex flex-col px-3.5 py-3 active:bg-raised"
          >
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-[17px] ${mode.tint}`}
            >
              {mode.icon}
            </span>
            <span className="display mt-2 text-[15px] leading-none">{mode.title}</span>
            <span className="mt-1 text-[11px] leading-snug text-muted">{mode.blurb}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
