'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * How far the bottom of the visible page is above the bottom of the layout.
 *
 * `position: fixed; bottom: 0` pins to the *layout* viewport, which on iOS
 * Safari extends underneath the browser's bottom toolbar. With the toolbar
 * expanded the tab bar therefore sits behind it, and as the toolbar collapses
 * on scroll the bar slides up into view — which is what "the nav moves when I
 * scroll" is. Rubber-banding past the end of the page does the same thing for
 * the same reason.
 *
 * The visual viewport is the part actually on screen, so the difference between
 * the two is exactly how far the bar has to be lifted to stay put.
 *
 * Returns 0 in an installed app, where there is no toolbar and nothing to
 * correct, and on any browser without a visual viewport.
 */
function useViewportLift(): number {
  const [lift, setLift] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const measure = () => {
      const layout = document.documentElement.clientHeight;
      const visible = viewport.offsetTop + viewport.height;
      const gap = layout - visible;

      // A toolbar is tens of pixels; a software keyboard is hundreds. Lifting
      // the tab bar over the toolbar is the fix, lifting it over the keyboard
      // would park it in the middle of the screen, so only the small case is
      // corrected. Negative values mean the page is scrolled past the layout
      // bottom, which needs no lift either.
      setLift(gap > 0 && gap < 120 ? Math.round(gap) : 0);
    };

    measure();
    viewport.addEventListener('resize', measure);
    viewport.addEventListener('scroll', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return lift;
}

// Five tabs is the practical ceiling on a phone. The extra game modes live on
// Home rather than crowding this, so the bar stays tappable.
const TABS = [
  { href: '/home', label: 'Home', icon: HomeIcon },
  { href: '/picks', label: 'Picks', icon: PicksIcon },
  { href: '/feed', label: 'Chat', icon: ChatIcon },
  { href: '/ranks', label: 'Ranks', icon: RanksIcon },
  { href: '/profile', label: 'You', icon: ProfileIcon },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const lift = useViewportLift();

  // Inside a conversation the tab bar goes away, which is what every chat app
  // does: the composer needs that strip, and a bar of tabs under a message box
  // is two rows of chrome competing for the same thumb.
  const inRoom = pathname.startsWith('/feed/c/');

  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    fetch('/api/channels')
      .then((response) => (response.ok ? response.json() : { unread: 0 }))
      .then((payload: { unread?: number }) => setUnread(payload.unread ?? 0))
      .catch(() => {
        // An offline badge is simply absent.
      });
  }, []);

  // On navigation, and again whenever a message lands anywhere. Realtime rather
  // than a timer: a badge that only updates when you happen to change screens
  // is the kind of thing people stop trusting, and a poll running all day is a
  // battery cost for a number that is usually zero.
  useEffect(() => {
    if (inRoom) return;
    refresh();

    const supabase = createClient();
    const channel = supabase
      .channel('nav-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        // Debounced: the subscription cannot be filtered by channel, so a busy
        // Sunday in any room would otherwise be one request per message.
        if (pending.current) clearTimeout(pending.current);
        pending.current = setTimeout(refresh, 400);
      })
      .subscribe();

    return () => {
      if (pending.current) clearTimeout(pending.current);
      void supabase.removeChannel(channel);
    };
  }, [pathname, inRoom, refresh]);

  if (inRoom) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-xl"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        // translate rather than `bottom`, so the browser can keep this on its
        // own compositor layer and the bar tracks the toolbar without a relayout
        // on every scroll event.
        transform: lift > 0 ? `translateY(-${lift}px)` : undefined,
      }}
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const badge = href === '/feed' ? unread : 0;

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-brand' : 'text-muted'
                }`}
              >
                <Icon filled={active} />
                {label}

                {badge > 0 && (
                  <span
                    aria-label={`${badge} unread`}
                    className="display absolute right-[22%] top-[7px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand px-1 text-[9px] leading-none text-brand-ink tabnum"
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Inline icons rather than an icon package: five glyphs is not worth the
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
        fillOpacity={filled ? 0.18 : 0}
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
        fillOpacity={filled ? 0.18 : 0}
      />
      <path d="m8 12.5 2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.18 : 0}
      />
    </svg>
  );
}

function RanksIcon({ filled }: { filled: boolean }) {
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
        fillOpacity={filled ? 0.18 : 0}
      />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
