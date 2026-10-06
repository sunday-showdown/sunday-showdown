'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const MARKETS = [
  { id: 'moneyline', label: 'Moneyline', blurb: 'Straight up' },
  { id: 'spread', label: 'Spread', blurb: 'Against the number' },
  { id: 'total', label: 'Total', blurb: 'Over or under' },
] as const;

export interface LeagueRules {
  lockPolicy: 'first_kickoff' | 'per_game';
  markets: string[];
  allowLateJoin: boolean;
  avatarUrl: string | null;
}

/**
 * The commissioner's controls.
 *
 * The lock rule is the one that matters and the one groups disagree about, so
 * it says plainly what each option means rather than naming them and leaving
 * people to find out in week 3. Changing markets applies to weeks that have not
 * opened yet, which is also stated — retroactively changing a contest people
 * have already picked would be the wrong behaviour and a confusing surprise.
 *
 * Every field saves on change. A settings screen with a Save button is a
 * settings screen people leave without pressing it.
 */
export default function LeagueSettings({
  leagueId,
  leagueName,
  rules,
}: {
  leagueId: string;
  leagueName: string;
  rules: LeagueRules;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(rules);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const save = async (patch: Record<string, unknown>, key: string, optimistic: Partial<LeagueRules>) => {
    const previous = draft;
    setDraft({ ...draft, ...optimistic });
    setBusy(key);
    setError('');

    try {
      const response = await fetch(`/api/leagues/${leagueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setDraft(previous);
        setError(result.error ?? 'That did not save.');
        return;
      }
      router.refresh();
    } catch {
      setDraft(previous);
      setError('Network error.');
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    setBusy('picture');
    setError('');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'league');
      form.append('leagueId', leagueId);

      const response = await fetch('/api/uploads', { method: 'POST', body: form });
      const result = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !result.url) {
        setError(result.error ?? 'That picture did not upload.');
        return;
      }
      setDraft((current) => ({ ...current, avatarUrl: result.url! }));
      router.refresh();
    } catch {
      setError('That picture did not upload.');
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const toggleMarket = (market: string) => {
    const next = draft.markets.includes(market)
      ? draft.markets.filter((value) => value !== market)
      : [...draft.markets, market];

    // At least one has to stay on, or a week opens with nothing to pick.
    if (next.length === 0) {
      setError('Leave at least one market on.');
      return;
    }
    void save({ markets: next }, `market-${market}`, { markets: next });
  };

  return (
    <section className="mt-5 px-4">
      <h2 className="eyebrow pb-2">Commissioner settings</h2>

      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-loss/15 px-4 py-3 text-[12px] text-loss">
          {error}
        </p>
      )}

      <div className="card mb-2 flex items-center gap-3.5 px-4 py-3.5">
        <LeagueBadge name={leagueName} url={draft.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold">League picture</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-muted">
            Shows next to the league everywhere in the app.
          </div>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
          className="h-9 shrink-0 rounded-xl border border-line bg-raised px-3.5 text-[12px] font-bold active:bg-line/50 disabled:opacity-60"
        >
          {busy === 'picture' ? '…' : draft.avatarUrl ? 'Change' : 'Add'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>

      <div className="card mb-2 px-4 py-3.5">
        <div className="text-[14px] font-bold">When picks lock</div>

        <div className="mt-2.5 space-y-2">
          <RuleChoice
            selected={draft.lockPolicy === 'first_kickoff'}
            disabled={busy !== null}
            onSelect={() => save({ lockPolicy: 'first_kickoff' }, 'lock', { lockPolicy: 'first_kickoff' })}
            title="All at the first kickoff"
            blurb="The whole card locks when the earliest game of the week starts. Nobody can watch a result before picking the rest."
          />
          <RuleChoice
            selected={draft.lockPolicy === 'per_game'}
            disabled={busy !== null}
            onSelect={() => save({ lockPolicy: 'per_game' }, 'lock', { lockPolicy: 'per_game' })}
            title="Each game at its own kickoff"
            blurb="Pick the Monday night game on Monday. More forgiving, but late picks are made knowing how the early ones went."
          />
        </div>
      </div>

      <div className="card mb-2 px-4 py-3.5">
        <div className="text-[14px] font-bold">Markets</div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
          Applies to weeks that have not opened yet, so a card people already
          picked never changes under them.
        </p>

        <div className="mt-2.5 flex gap-1.5">
          {MARKETS.map((market) => {
            const on = draft.markets.includes(market.id);
            return (
              <button
                key={market.id}
                type="button"
                disabled={busy !== null}
                onClick={() => toggleMarket(market.id)}
                aria-pressed={on}
                className={`flex-1 rounded-xl border px-2 py-2 text-center transition-colors disabled:opacity-60 ${
                  on ? 'border-brand bg-brand/15 text-brand' : 'border-line bg-raised text-muted'
                }`}
              >
                <span className="block text-[12px] font-bold">{market.label}</span>
                <span className="mt-0.5 block text-[10px] leading-tight">{market.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card flex items-center gap-3 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold">Let people join mid-season</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-muted">
            Off means the invite code stops working once the season is under way.
          </div>
        </div>
        <input
          type="checkbox"
          checked={draft.allowLateJoin}
          disabled={busy !== null}
          onChange={(event) =>
            save({ allowLateJoin: event.target.checked }, 'late', {
              allowLateJoin: event.target.checked,
            })
          }
          aria-label="Let people join mid-season"
          className="h-6 w-6 shrink-0 accent-brand"
        />
      </div>
    </section>
  );
}

function RuleChoice({
  selected,
  disabled,
  onSelect,
  title,
  blurb,
}: {
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
        selected ? 'border-brand bg-brand/10' : 'border-line bg-raised'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-brand' : 'border-line'
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-[13px] font-bold ${selected ? 'text-brand' : 'text-ink'}`}>
          {title}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted">{blurb}</span>
      </span>
    </button>
  );
}

/** A league's picture, or its initials when it has none. */
export function LeagueBadge({
  name,
  url,
  size = 44,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  if (url) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- a bucket URL;
         next/image would need the host allowlisted for no benefit here. */
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-xl border border-line object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="display flex shrink-0 items-center justify-center rounded-xl bg-raised text-muted"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '??'}
    </span>
  );
}
