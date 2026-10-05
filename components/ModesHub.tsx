import Link from 'next/link';

// The game modes that do not have a nav tab. Five tabs is the ceiling on a
// phone, so these live on Home where they are still one tap from the start.
const MODES = [
  {
    href: '/survivor',
    title: 'Survivor',
    blurb: 'One team a week. Never the same twice.',
    icon: '🛡️',
  },
  {
    href: '/td',
    title: 'TD Scorer',
    blurb: 'Call who finds the end zone.',
    icon: '🏈',
  },
  {
    href: '/h2h',
    title: 'Head to head',
    blurb: 'Call someone out for the week.',
    icon: '⚔️',
  },
  {
    href: '/playground',
    title: 'Playground',
    blurb: 'Wild calls, no points, pure bragging.',
    icon: '🎲',
  },
] as const;

export default function ModesHub() {
  return (
    <section className="mt-5">
      <h2 className="px-4 pb-2 font-display text-sm font-bold uppercase tracking-wide text-muted">
        More ways to play
      </h2>
      <div className="grid grid-cols-2 gap-2 px-4">
        {MODES.map((mode) => (
          <Link
            key={mode.href}
            href={mode.href}
            className="card flex flex-col gap-1 px-3 py-3 active:bg-raised"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {mode.icon}
            </span>
            <span className="text-sm font-semibold">{mode.title}</span>
            <span className="text-[11px] leading-snug text-muted">{mode.blurb}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
