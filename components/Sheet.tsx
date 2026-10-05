'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A bottom sheet.
 *
 * The right shape for a phone: it arrives from the edge the thumb is already
 * near, and it does not pretend to be a desktop dialog in the middle of the
 * screen. Three things it has to get right, all of which are easy to miss.
 *
 * Escape and a tap outside both close it, because a sheet with only a small
 * X button is a trap on a large phone.
 *
 * The page behind it stops scrolling while it is open, otherwise dragging
 * inside the sheet scrolls the channel underneath.
 *
 * Its own bottom padding respects the home indicator, so the last control is
 * not sitting under the gesture bar.
 */
export default function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the panel so the keyboard lands somewhere sensible and a screen
    // reader announces the sheet rather than continuing behind it.
    panel.current?.focus();

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[88dvh] w-full max-w-md animate-slide-up flex-col rounded-t-3xl border-t border-line bg-surface outline-none"
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
          <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-line" />
          <h2 className="display mt-1 text-[18px] leading-none">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap -mr-2 flex items-center justify-center rounded-xl text-muted active:bg-raised"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
          {children}
        </div>

        {footer && (
          <div
            className="border-t border-line px-4 pt-3"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
