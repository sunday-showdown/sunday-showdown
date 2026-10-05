import Link from 'next/link';

// The game modes that do not have a nav tab. Five tabs is the ceiling on a
// phone, so these live on Home where they are still one tap from the start.
//
// "Pot" used to be in this list, which was the wrong shape: a pot belongs to a
// competition, not to the league in general, so each mode now carries its own
// on its own screen. See lib/pot.ts.
const MODES = [
  { href: '/live', title: 'Live', blurb: 'Watch your card settle.', icon: '📡', tint: 'bg-live/15' },
  { href: '/survivor', title: 'Survivor', blurb: 'One team a week. Never twice.', icon: '🛡️', tint: 'bg-win/15' },
  { href: '/td', title: 'TD Scorer', blurb: 'Call the end zone.', icon: '🏈', tint: 'bg-brand/15' },
  { href: '/h2h', title: 'Head to head', blurb: 'Call someone out.', icon: '⚔️', tint: 'bg-gold/15' },
  { href: '/playground', title: 'Playground', blurb: 'Wild calls, pure bragging.', icon: '🎲', tint: 'bg-brand/15' },
  { href: '/friends', title: 'Friends', blurb: 'Follow and message your rivals.', icon: '🤝', tint: 'bg-win/15' },
  { href: '/leagues', title: 'Leagues', blurb: 'Members, codes and settings.', icon: '👥', tint: 'bg-raised' },
  { href: '/feed/highlights', title: 'Highlights', blurb: 'Results, upsets and streaks.', icon: '📣', tint: 'bg-gold/15' },
] as const;

export default function ModesHub() {
  return (
    <section className="mt-5">
      <h2 className="eyebrow px-4 pb-2">More ways to play</h2>
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
