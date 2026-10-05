import Link from 'next/link';

// The game modes that do not have a nav tab. Five tabs is the ceiling on a
// phone, so these live on Home where they are still one tap from the start.
const MODES = [
  { href: '/live', title: 'Live', blurb: 'Watch your card settle.', icon: '📡' },
  { href: '/survivor', title: 'Survivor', blurb: 'One team a week. Never twice.', icon: '🛡️' },
  { href: '/td', title: 'TD Scorer', blurb: 'Call the end zone.', icon: '🏈' },
  { href: '/h2h', title: 'Head to head', blurb: 'Call someone out.', icon: '⚔️' },
  { href: '/friends', title: 'Friends', blurb: 'Follow your rivals.', icon: '🤝' },
  { href: '/leagues', title: 'Leagues', blurb: 'Members and codes.', icon: '👥' },
  { href: '/pot', title: 'Pot', blurb: "Who's paid in.", icon: '💰' },
  { href: '/playground', title: 'Playground', blurb: 'Wild calls, pure bragging.', icon: '🎲' },
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
            className="card flex flex-col gap-0.5 px-3.5 py-3 active:bg-raised"
          >
            <span aria-hidden="true" className="text-[19px] leading-none">
              {mode.icon}
            </span>
            <span className="display mt-1 text-[15px] leading-none">{mode.title}</span>
            <span className="text-[11px] leading-snug text-muted">{mode.blurb}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
