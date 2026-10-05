'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Href for a back chevron. Omit on a tab root. */
  back?: string;
  /** Actions pinned to the right of the compact bar — bell, switcher, menu. */
  trailing?: ReactNode;
  /** Hide the large title entirely, for a screen that needs the height. */
  compact?: boolean;
}

/**
 * The top of every screen.
 *
 * Two rows, which is the iOS pattern and is here for a specific reason. The
 * status bar is translucent and viewport-fit is cover, so the webview runs up
 * under the notch; a page that simply padded its own heading left the heading
 * sitting against the clock and looking clipped. Instead the inset belongs to a
 * real sticky surface — the compact row — and the large title lives below it in
 * normal flow, free to scroll away underneath.
 *
 * max() rather than the raw inset: in a Safari tab the inset is 0, and the bar
 * still needs its own breathing room there.
 */
export default function AppBar({ title, subtitle, back, trailing, compact }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const bar = useRef<HTMLElement>(null);

  // Publish the bar's height as --appbar-h, so anything else that needs to
  // stick can stick *below* it rather than guessing. Pick'em has its own sticky
  // summary strip, and before this it pinned itself to the notch and sat on top
  // of the bar. Measured rather than hard-coded because the height moves with
  // the safe-area inset and with whatever `below` holds.
  useEffect(() => {
    const node = bar.current;
    if (!node) return;

    const publish = () => {
      document.documentElement.style.setProperty('--appbar-h', `${node.offsetHeight}px`);
    };
    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(node);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--appbar-h');
    };
  }, []);

  useEffect(() => {
    // Collapse once the large title has mostly gone. Passive: this must never
    // be the reason a scroll stutters.
    const onScroll = () => setScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const collapsed = compact || scrolled;

  return (
    <>
      <header
        ref={bar}
        className={`sticky top-0 z-30 transition-[background-color,box-shadow,backdrop-filter] duration-200 ${
          collapsed
            ? 'bg-bg/95 shadow-[0_1px_0_0_rgb(var(--line)/0.8)] backdrop-blur-xl'
            : 'bg-transparent'
        }`}
        // calc rather than max alone: the inset puts the bar below the status
        // bar, and the extra 6px is the gap between them. Without it the title
        // sits flush against the clock and reads as clipped even when it is not.
        style={{
          paddingTop: 'calc(max(var(--safe-top, env(safe-area-inset-top)), 0.5rem) + 6px)',
        }}
      >
        <div className="mx-auto flex h-11 max-w-md items-center gap-1 px-2">
          {back ? (
            <Link
              href={back}
              aria-label="Back"
              className="tap -ml-1 flex items-center justify-center rounded-xl text-ink active:bg-raised"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="m14.5 6-6 6 6 6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          ) : (
            <span className="w-1" />
          )}

          {/* The compact title only appears once the big one is out of view, so
              the two are never on screen together. */}
          <h2
            aria-hidden={!collapsed}
            className={`display min-w-0 flex-1 truncate px-1 text-[16px] leading-none transition-opacity duration-200 ${
              collapsed ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {title}
          </h2>

          <div className="flex shrink-0 items-center gap-1.5 pr-1">{trailing}</div>
        </div>
      </header>

      {!compact && (
        <div className="px-4 pb-3 pt-1">
          <h1 className="display text-[30px] leading-[1.02]">{title}</h1>
          {subtitle && <div className="mt-0.5 text-[12px] leading-snug text-muted">{subtitle}</div>}
        </div>
      )}
    </>
  );
}
