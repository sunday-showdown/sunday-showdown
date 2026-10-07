'use client';

import { archetypeOf, bannerOf } from '@/lib/fighters';

/**
 * A fighter.
 *
 * Painted character art, prepared by scripts/prepare-fighters.mjs and served
 * from public/fighters. This used to be hand-authored SVG and it was not good
 * enough: flat vector cannot carry muscle, material or light, and next to real
 * art it read as a diagram of a football player rather than one.
 *
 * The team colour is a different file rather than a filter. Each character is
 * repainted into each of the six colours ahead of time, so picking a colour
 * costs an image request and nothing else: it renders on the server, costs the
 * client no work, and cannot flash the wrong colour on first paint the way a
 * canvas recolour would. The repaint preserves lightness, so every fold and
 * scuff in the original survives and only the hue under them changes.
 *
 * Two sizes of each, because the picker shows six at once and the full files
 * are about 190KB: anything small enough to be a thumbnail gets the 180px copy.
 *
 * Two framings too. `frame="bust"` crops to the helmet and shoulders using a
 * per-character anchor from lib/fighters.ts, because a whole figure at 44
 * pixels in a list row is a smudge, and these six stand differently enough that
 * one fixed crop would behead at least two of them.
 *
 * All six are drawn facing right or square on, so a duel mirrors whoever stands
 * on the right. The mirror goes on the wrapper, not the image: the idle and
 * ready animations animate `transform`, and an animated property beats an
 * inline one outright — so a flip set on the image was silently thrown away for
 * as long as the animation ran, which was always, and both fighters faced the
 * same way.
 */

export type FighterState = 'idle' | 'ready' | 'hit' | 'down';

/** What each state does. Transform only, so none of it costs a layout. */
const ANIMATION: Record<FighterState, string> = {
  idle: 'fighter-idle 4.2s ease-in-out infinite',
  ready: 'fighter-ready 1.8s ease-in-out infinite',
  hit: 'fighter-hit 520ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
  down: 'fighter-down 700ms cubic-bezier(0.22, 1, 0.36, 1) both',
};

export default function FighterArt({
  archetype,
  banner,
  size = 48,
  frame = 'bust',
  state = 'idle',
  flip = false,
  glow = false,
  className,
}: {
  archetype: string;
  banner: string;
  /** Height of the figure in pixels. */
  size?: number;
  frame?: 'bust' | 'full';
  state?: FighterState;
  /** Face the other way, so two fighters square up rather than both face out. */
  flip?: boolean;
  /** A pool of banner colour under the feet. */
  glow?: boolean;
  className?: string;
}) {
  const meta = archetypeOf(archetype);
  const colour = bannerOf(banner);
  const { from } = colour;

  // Below this the thumbnail is indistinguishable and a tenth of the weight.
  const thumb = size <= 100;
  const src = `/fighters/${meta.id}-${colour.id}${thumb ? '@sm' : ''}.png`;

  // The bust crop, worked out in pixels rather than percentages.
  //
  // A percentage offset cannot place the helmet: the figures have six different
  // aspect ratios, so "left: 60%" means a different number of pixels in each
  // and the first attempt framed a glove. With the art's real dimensions the
  // sum is exact — scale the image up, then slide the helmet to the middle of
  // the window.
  const zoom = 2.9;
  const artH = size * zoom;
  const artW = artH * (meta.art.w / meta.art.h);
  const offsetX = size / 2 - (meta.head.x / 100) * artW;
  const offsetY = size * 0.46 - (meta.head.y / 100) * artH;

  return (
    <span
      className={`relative inline-flex shrink-0 items-end justify-center ${className ?? ''}`}
      style={{
        height: size,
        width: frame === 'bust' ? size : 'auto',
        overflow: frame === 'bust' ? 'hidden' : 'visible',
        transform: flip ? 'scaleX(-1)' : undefined,
      }}
    >
      {glow && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{
            height: Math.round(size * 0.22),
            background: `radial-gradient(60% 100% at 50% 100%, ${from}66 0%, transparent 72%)`,
          }}
        />
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- these are local,
          fixed-size, pre-sized assets; next/image would add a loader and a
          layout wrapper for no benefit at this size. */}
      <img
        src={src}
        alt={`${meta.name}, ${meta.position}`}
        draggable={false}
        style={{
          height: frame === 'bust' ? artH : size,
          width: 'auto',
          maxWidth: 'none',
          position: frame === 'bust' ? 'absolute' : 'relative',
          left: frame === 'bust' ? offsetX : undefined,
          top: frame === 'bust' ? offsetY : undefined,
          transformOrigin: 'center bottom',
          animation: ANIMATION[state],
          filter: state === 'down' ? 'grayscale(0.7) brightness(0.65)' : undefined,
        }}
      />
    </span>
  );
}
