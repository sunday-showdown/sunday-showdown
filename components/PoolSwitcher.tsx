'use client';

import { useRouter } from 'next/navigation';

/**
 * Which pool you are looking at.
 *
 * A pool switcher rather than a league switcher. A pool does not have to belong
 * to a league at all, and making people change their active league to look at a
 * pool was asking them to re-aim the whole app in order to read one screen.
 */
export default function PoolSwitcher({
  pools,
  currentId,
}: {
  pools: readonly { id: string; name: string; alive: number; members: number }[];
  currentId: string;
}) {
  const router = useRouter();
  if (pools.length < 2) return null;

  return (
    <div className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
      {pools.map((pool) => {
        const active = pool.id === currentId;
        return (
          <button
            key={pool.id}
            type="button"
            onClick={() => router.push(`/survivor?pool=${pool.id}`)}
            aria-pressed={active}
            className={`h-9 shrink-0 rounded-xl px-3.5 text-[13px] font-bold leading-none transition-colors ${
              active ? 'bg-ink text-bg' : 'bg-raised text-muted'
            }`}
          >
            {pool.name}
            <span className={`ml-1.5 text-[11px] ${active ? 'text-bg/60' : 'text-muted'}`}>
              {pool.alive}/{pool.members}
            </span>
          </button>
        );
      })}
    </div>
  );
}
