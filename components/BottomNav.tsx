'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/home', label: 'Home', icon: HomeIcon },
  { href: '/picks', label: 'Picks', icon: PicksIcon },
  { href: '/standings', label: 'Standings', icon: StandingsIcon },
  { href: '/profile', label: 'You', icon: ProfileIcon },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-brand' : 'text-muted'
                }`}
              >
                <Icon filled={active} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Inline icons rather than an icon package: four glyphs is not worth the
// bundle, and these inherit currentColor.
function HomeIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.15 : 0}
      />
    </svg>
  );
}

function PicksIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.15 : 0}
      />
      <path d="m8 12.5 2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StandingsIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 20V11m7 9V4m7 16v-6"
        stroke="currentColor"
        strokeWidth={filled ? '2.6' : '1.8'}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProfileIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="8.5"
        r="3.75"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.15 : 0}
      />
      <path
        d="M4.5 20.5a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
