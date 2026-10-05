'use client';

import { useEffect } from 'react';

/**
 * Make the top inset trustworthy.
 *
 * iOS has a long-standing bug: with `apple-mobile-web-app-status-bar-style` set
 * to `black-translucent`, an installed PWA runs its content underneath the
 * status bar but reports `env(safe-area-inset-top)` as 0 anyway. Every heading
 * in the app then sat against the clock, and no amount of padding read from
 * env() could fix it, because env() was the thing that was wrong.
 *
 * The status bar style is now `black`, which makes iOS reserve that strip
 * itself. This is the belt to that braces: it measures whether the viewport is
 * actually running full-bleed, and only if it is does it publish a top inset of
 * its own. The measurement is the point — a device check would guess, whereas
 * an innerHeight that reaches the full screen height means the content really
 * is under the status bar, whatever the meta tag says.
 *
 * When iOS is behaving, this does nothing at all and the CSS falls through to
 * env(safe-area-inset-top).
 */
export default function SafeArea() {
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      // Only ever relevant for an installed app. In a browser tab the chrome
      // occupies this space and innerHeight is far short of the screen anyway.
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;

      if (!standalone || !window.screen?.height) {
        root.style.removeProperty('--safe-top');
        return;
      }

      // Landscape swaps the axes and puts the insets on the sides, where this
      // has nothing useful to say.
      const screenHeight = Math.max(window.screen.height, window.screen.width);
      const portrait = window.innerHeight >= window.innerWidth;
      if (!portrait) {
        root.style.removeProperty('--safe-top');
        return;
      }

      // If iOS reserved the status bar, the viewport is meaningfully shorter
      // than the screen. If it did not, they are the same and we are drawing
      // under it.
      const fullBleed = window.innerHeight >= screenHeight - 4;
      if (!fullBleed) {
        root.style.removeProperty('--safe-top');
        return;
      }

      // 812pt is the iPhone X and everything after it — the devices with a
      // notch or a Dynamic Island, where the reserved strip is much taller than
      // the old 20pt status bar.
      root.style.setProperty('--safe-top', screenHeight >= 812 ? '47px' : '20px');
    };

    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);

    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      root.style.removeProperty('--safe-top');
    };
  }, []);

  return null;
}
