'use client';

import { useEffect } from 'react';

/**
 * Make the top inset trustworthy.
 *
 * Three things have to be true for a heading to clear the status bar on an
 * installed iPhone app, and iOS gets one of them wrong.
 *
 * `viewport-fit=cover` puts the web view edge to edge, which is what makes the
 * app look native and is also what puts content under the clock unless it is
 * padded. The padding is supposed to come from env(safe-area-inset-top) — but
 * WebKit reports that as 0 in a standalone web app often enough that it cannot
 * be relied on alone. So this measures env() directly through a probe element,
 * and only when the probe comes back empty *and* the viewport is genuinely
 * running full-bleed does it supply a value of its own.
 *
 * That last value used to be a flat 47px, which was right for a notch and about
 * twelve pixels short on a Dynamic Island — enough to tuck the back button
 * under the bottom edge of the status bar. It is picked from the screen height
 * now, which is the only signal available that distinguishes them.
 */

/** The safe inset iOS uses, by portrait screen height in CSS pixels. */
function insetForScreen(height: number): number {
  if (height >= 852) return 59; // Dynamic Island: 14 Pro and later
  if (height >= 812) return 47; // Notch: X through 13, and the non-Pro 14
  return 20; // Touch ID era, where the status bar is just a bar
}

export default function SafeArea() {
  useEffect(() => {
    const root = document.documentElement;

    /** What env(safe-area-inset-top) actually resolves to, in pixels. */
    const measureEnv = (): number => {
      const probe = document.createElement('div');
      probe.style.cssText =
        'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top)';
      document.body.appendChild(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    };

    const apply = () => {
      // Only ever relevant for an installed app. In a browser tab the chrome
      // occupies this space and the viewport is far shorter than the screen.
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;

      if (!standalone || !window.screen?.height) {
        root.style.removeProperty('--safe-top');
        return;
      }

      // Landscape puts the insets on the sides, where this has nothing to say.
      if (window.innerHeight < window.innerWidth) {
        root.style.removeProperty('--safe-top');
        return;
      }

      // env() working is the good case: the CSS already reads it, and a value
      // from here would only fight with it.
      if (measureEnv() > 0) {
        root.style.removeProperty('--safe-top');
        return;
      }

      // env() is zero. If the viewport is also shorter than the screen then iOS
      // reserved the strip itself and there is nothing to pad for.
      const screenHeight = Math.max(window.screen.height, window.screen.width);
      if (window.innerHeight < screenHeight - 4) {
        root.style.removeProperty('--safe-top');
        return;
      }

      // Edge to edge with no inset reported. This is the case the whole file
      // exists for.
      root.style.setProperty('--safe-top', `${insetForScreen(screenHeight)}px`);
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
