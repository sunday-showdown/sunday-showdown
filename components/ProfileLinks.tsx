import Link from 'next/link';

// The places that are not games.
//
// These were in the modes grid on Home under the heading "More ways to play",
// which none of them are. They belong with the rest of your own stuff.
const LINKS = [
  { href: '/friends', title: 'Friends', blurb: 'Follow and message your rivals.', icon: '🤝' },
  { href: '/leagues', title: 'Leagues', blurb: 'Members, codes and settings.', icon: '👥' },
  { href: '/recap', title: 'Week recap', blurb: 'How last week actually went.', icon: '📋' },
  { href: '/feed/highlights', title: 'Highlights', blurb: 'Results, upsets and streaks.', icon: '📣' },
  { href: '/bets', title: 'My bets', blurb: 'Units, ROI and your record.', icon: '📊' },
  { href: '/settings', title: 'Settings', blurb: 'Name, password, notifications, books.', icon: '⚙️' },
] as const;

export default function ProfileLinks() {
  return (
    <section className="mt-6">
      <h2 className="eyebrow px-4 pb-2">Everything else</h2>
      <div className="card mx-4 overflow-hidden">
        <ul className="divide-y divide-line/60">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="flex items-center gap-3 px-4 py-3 active:bg-raised">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raised text-[16px]"
                >
                  {link.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold">{link.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted">{link.blurb}</span>
                </span>
                <span className="shrink-0 text-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
