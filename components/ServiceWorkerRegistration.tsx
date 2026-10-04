'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Registered after load so it never competes with the first paint.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration costs offline support, nothing else.
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
