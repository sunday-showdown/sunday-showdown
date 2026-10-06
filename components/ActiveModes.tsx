import Link from 'next/link';
import { urgentCount, type ActiveMode, type ModeTone } from '@/lib/modes';

/**
 * Everything you are in, on the screen the app opens to.
 *
 * Home used to show the same nine tiles whether or not you were in any of them,
 * so being in a survivor pool was invisible until you went looking for it. This
 * shows the things you are actually in, urgent first. The grid of every mode
 * still exists below as a way to start something new (components/ModesHub).
 */
const TONE: Record<ModeTone, { chip: string; label: string }> = {
  urgent: { chip: 'bg-brand/15 text-brand', label: 'Needs you' },
  live: { chip: 'bg-live/15 text-live', label: 'Live' },
  ok: { chip: 'bg-win/15 text-win', label: 'Set' },
  out: { chip: 'bg-loss/15 text-loss', label: 'Done' },
  idle: { chip: 'bg-raised text-muted', label: 'Open' },
};

export default function ActiveModes({ modes }: { modes: readonly ActiveMode[] }) {
  if (modes.length === 0) return null;

  const needed = urgentCount(modes);

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between px-4 pb-2">
        <h2 className="eyebrow">You&apos;re playing</h2>
        {needed > 0 && (
          <span className="text-[11px] font-bold text-brand">
            {needed} need{needed === 1 ? 's' : ''} you
          </span>
        )}
      </div>

      <div className="space-y-2 px-4">
        {modes.map((mode) => {
          const tone = TONE[mode.tone];

          return (
            <Link
              key={mode.key}
              href={mode.href}
              className={`card flex items-center gap-3 px-4 py-3 active:bg-raised ${
                mode.tone === 'urgent' ? 'border-brand/40' : ''
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raised text-[17px]"
              >
                {mode.icon}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="display truncate text-[15px] leading-none">{mode.title}</span>
                  {mode.scope && (
                    <span className="truncate text-[11px] text-muted">· {mode.scope}</span>
                  )}
                </span>
                <span className="mt-1 block truncate text-[12px] text-muted">
                  {mode.todo ?? mode.status}
                </span>
              </span>

              {mode.badge !== null ? (
                <span className="display flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] leading-none text-brand-ink tabnum">
                  {mode.badge > 9 ? '9+' : mode.badge}
                </span>
              ) : (
                <span className={`chip shrink-0 ${tone.chip}`}>{tone.label}</span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
