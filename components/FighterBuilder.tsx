'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from './Sheet';
import FighterArt from './FighterArt';
import {
  ARCHETYPES,
  BANNERS,
  NAME_MAX,
  TAUNT_MAX,
  archetypeOf,
  bannerOf,
  validateFighter,
  type Fighter,
} from '@/lib/fighters';

/**
 * Build your fighter.
 *
 * Everything here is cosmetic, and the copy says so — if a style looked like it
 * might hit harder, people would pick the one that hits harder instead of the
 * one they like, and a duel would stop being about picking well. See
 * lib/fighters.ts.
 *
 * Validated with the same function the API uses, so the form cannot accept
 * something the server will refuse.
 */
export default function FighterBuilder({ fighter }: { fighter: Fighter }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(fighter.name);
  const [archetype, setArchetype] = useState<string>(fighter.archetype);
  const [banner, setBanner] = useState<string>(fighter.banner);
  const [taunt, setTaunt] = useState(fighter.taunt ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = archetypeOf(archetype);

  const save = async () => {
    const checked = validateFighter({ name, archetype, banner, taunt });
    if (!checked.ok) {
      setError(checked.error);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/fighters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checked.draft),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result?.error ?? 'That did not save.');
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card flex w-full items-center gap-3 px-4 py-3 text-left active:bg-raised"
      >
        <FighterArt
          archetype={fighter.archetype}
          banner={fighter.banner}
          size={46}
          className="shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="display block truncate text-[16px] leading-none">{fighter.name}</span>
          <span className="mt-1 block truncate text-[11px] text-muted">
            {archetypeOf(fighter.archetype).name} · {archetypeOf(fighter.archetype).position} ·{' '}
            {fighter.wins}W {fighter.losses}L
          </span>
        </span>
        <span className="text-[11px] font-bold text-brand">Edit →</span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Your fighter"
        footer={
          <button type="button" onClick={save} disabled={busy} className="btn-primary w-full text-[15px]">
            {busy ? 'Saving…' : 'Save fighter'}
          </button>
        }
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl bg-raised/60 p-3">
            <FighterArt archetype={archetype} banner={banner} size={76} className="shrink-0" />
            <div className="min-w-0">
              <div className="display truncate text-[20px] leading-none">{name || 'Unnamed'}</div>
              <div className="mt-1 text-[11px] text-muted">
                {preview.name} · {preview.position}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                Signature: <span className="font-bold text-ink">{preview.strike}</span>
              </div>
            </div>
          </div>

          <label className="block">
            <span className="eyebrow pb-2">Fighter name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={NAME_MAX}
              className="field"
              placeholder="The Hammer"
            />
          </label>

          <div>
            <span className="eyebrow pb-2">Style</span>
            <p className="pb-2 text-[11px] text-muted">
              Looks only. Duels are won by the card you pick, never by the fighter you built.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ARCHETYPES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setArchetype(option.id)}
                  aria-pressed={archetype === option.id}
                  className={`card flex flex-col items-center px-1.5 py-2 ${
                    archetype === option.id ? 'border-brand/60' : ''
                  }`}
                >
                  {/* Each tile previews in the colour being chosen, so the two
                      decisions can be made together rather than one then the
                      other. */}
                  <FighterArt archetype={option.id} banner={banner} size={44} />
                  <span className="mt-1 text-[11px] font-bold leading-none">{option.name}</span>
                  <span className="mt-1 text-center text-[9px] leading-tight text-muted">
                    {option.position}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="eyebrow pb-2">Banner</span>
            <div className="flex flex-wrap gap-2 pt-1">
              {BANNERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setBanner(option.id)}
                  aria-label={option.name}
                  aria-pressed={banner === option.id}
                  className={`tap h-10 w-10 rounded-xl ring-offset-2 ring-offset-surface ${
                    banner === option.id ? 'ring-2 ring-ink' : ''
                  }`}
                  style={{
                    backgroundImage: `linear-gradient(160deg, ${option.from} 0%, ${option.to} 100%)`,
                  }}
                />
              ))}
            </div>
          </div>

          <label className="block">
            <span className="eyebrow pb-2">Taunt</span>
            <p className="pb-2 text-[11px] text-muted">
              What they read when you call them out. Optional, and the best part.
            </p>
            <input
              value={taunt}
              onChange={(event) => setTaunt(event.target.value)}
              maxLength={TAUNT_MAX}
              className="field"
              placeholder="Your card is already losing."
            />
          </label>

          {error && (
            <p role="alert" className="rounded-xl bg-loss/15 px-4 py-3 text-sm text-loss">
              {error}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
