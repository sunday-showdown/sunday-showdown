'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export default function WeekSelector({
  week,
  maxWeek = 18,
}: {
  week: number;
  maxWeek?: number;
}) {
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
          className={`h-8 shrink-0 rounded-lg px-3 text-xs font-bold tabnum transition-colors ${
            n === week ? 'bg-brand text-brand-ink' : 'bg-raised text-muted'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
