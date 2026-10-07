'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function WeekSelector({ week, maxWeek = 18 }: { week: number; maxWeek?: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = useRef<HTMLButtonElement>(null);

  // Eighteen weeks do not fit on a phone, so by December the current week is
  // off the right edge and the row opens showing week 1. Centre it instead.
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [week]);

  const go = (target: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('week', String(target));
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-2.5">
      {Array.from({ length: maxWeek }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          ref={n === week ? active : undefined}
          type="button"
          onClick={() => go(n)}
          aria-current={n === week ? 'true' : undefined}
          aria-label={`Week ${n}`}
          // 44pt is Apple's minimum comfortable target and these were 36.
          // Eighteen of them in a scrolling row is exactly the place a thumb
          // misses, because the row moves under it.
          className={`display h-11 w-11 shrink-0 rounded-xl text-[14px] leading-none transition-colors ${
            n === week
              ? 'bg-brand text-brand-ink glow-brand'
              : 'bg-raised text-muted active:bg-line/60'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
