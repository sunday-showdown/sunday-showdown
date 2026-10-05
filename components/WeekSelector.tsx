'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export default function WeekSelector({ week, maxWeek = 18 }: { week: number; maxWeek?: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

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
          type="button"
          onClick={() => go(n)}
          aria-current={n === week ? 'true' : undefined}
          aria-label={`Week ${n}`}
          className={`display h-9 w-9 shrink-0 rounded-xl text-[14px] leading-none transition-colors ${
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
