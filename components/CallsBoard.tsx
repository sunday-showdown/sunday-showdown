'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface Call {
  id: string;
  targetName: string;
  prediction: string;
  confidence: number | null;
  isPickOfTheWeek: boolean;
  result: string;
}

export interface LeagueCall extends Call {
  author: string;
}

interface Props {
  leagueId: string;
  season: number;
  week: number;
  cardId: string | null;
  published: boolean;
  myCalls: readonly Call[];
  leagueCalls: readonly LeagueCall[];
}

export default function CallsBoard({
  leagueId,
  season,
  week,
  cardId,
  published,
  myCalls,
  leagueCalls,
}: Props) {
  const router = useRouter();
  const [target, setTarget] = useState('');
  const [prediction, setPrediction] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const post = async (payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leagueId, season, week, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage({ tone: 'error', text: result?.error ?? 'That did not work.' });
        return false;
      }
      setMessage({ tone: 'ok', text: success });
      router.refresh();
      return true;
    } catch {
      setMessage({ tone: 'error', text: 'Network error.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addCall = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target.trim() || !prediction.trim()) return;
    const ok = await post(
      { action: 'add', targetName: target.trim(), prediction: prediction.trim(), confidence },
      'Call added.',
    );
    if (ok) {
      setTarget('');
      setPrediction('');
    }
  };

  return (
    <>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mx-4 mb-3 rounded-xl px-4 py-3 text-sm ${
            message.tone === 'error' ? 'bg-loss/15 text-loss' : 'bg-brand/15 text-brand'
          }`}
        >
          {message.text}
        </p>
      )}

      {!published && (
        <section className="px-4">
          <form onSubmit={addCall} className="card space-y-3 p-4">
            <div>
              <label htmlFor="target" className="mb-1.5 block text-sm font-medium">
                Who or what
              </label>
              <input
                id="target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="field"
                maxLength={60}
                placeholder="Justin Jefferson"
              />
            </div>

            <div>
              <label htmlFor="prediction" className="mb-1.5 block text-sm font-medium">
                The call
              </label>
              <input
                id="prediction"
                value={prediction}
                onChange={(e) => setPrediction(e.target.value)}
                className="field"
                maxLength={140}
                placeholder="150+ yards and a score"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium">How sure are you</span>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setConfidence(n)}
                    aria-pressed={confidence === n}
                    className={`h-9 flex-1 rounded-xl text-sm font-bold transition-colors ${
                      confidence === n ? 'bg-brand text-brand-ink' : 'bg-raised text-muted'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy || !target.trim() || !prediction.trim()}
              className="btn-primary h-11 w-full text-sm"
            >
              Add call
            </button>
          </form>
        </section>
      )}

      {myCalls.length > 0 && (
        <section className="mt-4 px-4">
          <div className="flex items-center justify-between pb-2">
            <h2 className="eyebrow">
              Your calls
            </h2>
            {!published && (
              <button
                type="button"
                disabled={busy}
                onClick={() => post({ action: 'publish', cardId }, 'Published to your league.')}
                className="btn-ghost h-8 px-3 text-xs"
              >
                Publish
              </button>
            )}
          </div>

          <div className="space-y-2">
            {myCalls.map((call) => (
              <CallRow key={call.id} call={call} />
            ))}
          </div>

          {published && (
            <p className="mt-2 text-[11px] text-muted">
              Published — your league can see these now.
            </p>
          )}
        </section>
      )}

      {leagueCalls.length > 0 && (
        <section className="mt-5 px-4">
          <h2 className="pb-2 eyebrow">
            Around the league
          </h2>
          <div className="space-y-2">
            {leagueCalls.map((call) => (
              <CallRow key={call.id} call={call} author={call.author} />
            ))}
          </div>
        </section>
      )}

      {myCalls.length === 0 && leagueCalls.length === 0 && (
        <p className="px-6 pt-6 text-center text-sm leading-relaxed text-muted">
          No calls yet. Make one above — anything you like, as specific as you
          dare. No points, just a record of who saw it coming.
        </p>
      )}
    </>
  );
}

function CallRow({ call, author }: { call: Call; author?: string }) {
  const tone =
    call.result === 'win'
      ? 'border-win/40 bg-win/10'
      : call.result === 'loss'
        ? 'border-loss/30 bg-loss/5'
        : '';

  return (
    <div className={`card px-4 py-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {author && <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand">{author}</div>}
          <div className="display text-[17px] leading-none">{call.targetName}</div>
          <div className="mt-0.5 text-sm leading-snug text-muted">{call.prediction}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {call.isPickOfTheWeek && (
            <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
              LOCK
            </span>
          )}
          {call.confidence !== null && (
            <span className="text-[10px] tabnum text-muted">{'★'.repeat(call.confidence)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
