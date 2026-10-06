'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from './Sheet';
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

  const preview = { archetype: archetypeOf(archetype), banner: bannerOf(banner) };

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
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[22px]"
          style={{
            backgroundImage: `linear-gradient(160deg, ${bannerOf(fighter.banner).from} 0%, ${bannerOf(fighter.banner).to} 100%)`,
          }}
        >
          {archetypeOf(fighter.archetype).glyph}
        </span>
        <span className="min-w-0 flex-1">
          <span className="display block truncate text-[16px] leading-none">{fighter.name}</span>
          <span className="mt-1 block text-[11px] text-muted">
            {archetypeOf(fighter.archetype).name} · {fighter.wins}W {fighter.losses}L
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
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-[34px]"
              style={{
                backgroundImage: `linear-gradient(160deg, ${preview.banner.from} 0%, ${preview.banner.to} 100%)`,
              }}
            >
              {preview.archetype.glyph}
            </span>
            <div className="min-w-0">
              <div className="display truncate text-[20px] leading-none">{name || 'Unnamed'}</div>
              <div className="mt-1 text-[11px] text-muted">
                {preview.archetype.name} · signature: {preview.archetype.strike}
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
                  className={`card flex flex-col items-center px-2 py-2.5 ${
                    archetype === option.id ? 'border-brand/60' : ''
                  }`}
                >
                  <span aria-hidden="true" className="text-[20px]">
                    {option.glyph}
                  </span>
                  <span className="mt-1 text-[11px] font-bold">{option.name}</span>
                  <span className="mt-0.5 text-center text-[9px] leading-tight text-muted">
                    {option.blurb}
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
