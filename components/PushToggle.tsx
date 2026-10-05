'use client';

import { useEffect, useState } from 'react';

type State =
  | 'checking'
  | 'unsupported'
  | 'needs-install'
  | 'blocked'
  | 'off'
  | 'on'
  | 'working';

/**
 * Turn on push for this device.
 *
 * iOS only delivers web push to a PWA added to the home screen, and only from
 * 16.4. In a Safari tab the permission prompt never appears, so rather than
 * showing a button that silently does nothing, this detects the case and tells
 * the user what to do instead.
 */
export default function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!publicKey) {
      setState('unsupported');
      return;
    }
    if (typeof window === 'undefined') return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // On iOS this is the tab case: PushManager only exists in standalone.
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      setState(isIos && !standalone ? 'needs-install' : 'unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => setState(existing ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, [publicKey]);

  const enable = async () => {
    setState('working');
    setError('');

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey!),
      });

      const response = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      if (!response.ok) {
        setError('Could not save this device.');
        setState('off');
        return;
      }
      setState('on');
    } catch {
      setError('Your browser refused the subscription.');
      setState('off');
    }
  };

  const disable = async () => {
    setState('working');
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      setState('off');
    } catch {
      setState('on');
    }
  };

  if (state === 'checking') return null;

  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-bold">Push notifications</div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted">{describe(state)}</div>
        </div>

        {(state === 'off' || state === 'on' || state === 'working') && (
          <button
            type="button"
            disabled={state === 'working'}
            onClick={state === 'on' ? disable : enable}
            aria-pressed={state === 'on'}
            className={`h-9 shrink-0 rounded-xl px-4 text-xs font-bold transition-colors ${
              state === 'on' ? 'border border-line bg-raised text-muted' : 'bg-brand text-brand-ink'
            }`}
          >
            {state === 'working' ? '…' : state === 'on' ? 'On' : 'Turn on'}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-[11px] text-loss">{error}</p>}
    </div>
  );
}

function describe(state: State): string {
  switch (state) {
    case 'on':
      return 'Lock reminders and results reach this device.';
    case 'off':
      return 'Get a nudge before the lock and when results land.';
    case 'blocked':
      return 'Blocked in your browser settings. Allow notifications for this site, then come back.';
    case 'needs-install':
      return 'On iPhone, add Showdown to your home screen first — Safari tabs cannot receive push.';
    case 'unsupported':
      return 'This browser cannot receive push notifications.';
    default:
      return '';
  }
}

/**
 * VAPID keys travel as base64url; PushManager wants raw bytes.
 */
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalised);
  // Allocate the ArrayBuffer explicitly: a plain Uint8Array is typed over
  // ArrayBufferLike, which includes SharedArrayBuffer and is not a BufferSource.
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return view;
}
