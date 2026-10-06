'use client';

import { useId } from 'react';
import { archetypeOf, bannerOf } from '@/lib/fighters';

/**
 * A fighter, drawn.
 *
 * The six archetypes were emoji — an axe, a shield, a crystal ball — which was
 * fine as a placeholder and wrong for this app: a football pick'em called
 * Showdown had a wizard in its arena. These are football gladiators, built from
 * one shared bust so the six read as a set: shoulder pads, a helmet, a facemask
 * cage. What separates them is everything above and around the shell, which is
 * the part still legible at 44 pixels in a list.
 *
 * Laid out on a fixed 64-unit grid, in three bands, so a new archetype can be
 * added without re-deriving where anything sits:
 *
 *   y 0–11   crest, horns, wings — whatever makes the silhouette
 *   y 11–49  the helmet, with the face opening and cage at its lower half
 *   y 46–64  shoulder pads, running off the bottom edge
 *
 * Nothing here is random or stateful. The shell takes the fighter's banner
 * colours, so the same fighter is the same object on every screen, and it is one
 * inline SVG rather than six image files — at these sizes the paths cost less
 * than the requests would.
 */

/**
 * The helmet shell.
 *
 * A flat-ish crown rather than a dome — the first draft arced too high over too
 * narrow a base and read as a motorcycle helmet. The jaw tucks in below the ear
 * line, which is the line that says football.
 */
const SHELL =
  'M13 33C13 18.5 21 11.5 32 11.5S51 18.5 51 33v6c0 7.5-8 12-19 12s-19-4.5-19-12z';

/**
 * The face opening.
 *
 * Deliberately large — close to half the shell. A real facemask frames most of
 * the face, and the small slot this started as left the cage floating in the
 * middle of a blank helmet with nothing to be a cage over.
 */
const FACE = 'M21.5 31h21v10c0 6.5-4.5 10-10.5 10s-10.5-3.5-10.5-10z';

export default function FighterArt({
  archetype,
  banner,
  size = 48,
  className,
}: {
  archetype: string;
  banner: string;
  size?: number;
  className?: string;
}) {
  // Gradient ids are document-global, so several fighters on one screen would
  // otherwise all paint with whichever defs rendered last.
  const uid = useId().replace(/:/g, '');
  const shell = `sh-${uid}`;
  const pads = `pd-${uid}`;

  const { from, to } = bannerOf(banner);
  const kind = archetypeOf(archetype).id;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`${archetypeOf(archetype).name} fighter`}
    >
      <defs>
        <linearGradient id={shell} x1="0.2" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        {/* Pads sit behind and read as a darker mass, so the helmet stays the
            thing the eye lands on. */}
        <linearGradient id={pads} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={to} />
          <stop offset="100%" stopColor={to} stopOpacity="0.55" />
        </linearGradient>
      </defs>

      <Ornament kind={kind} from={from} to={to} place="behind" />
      <Pads kind={kind} fill={`url(#${pads})`} />

      <path d={SHELL} fill={`url(#${shell})`} />
      {/* One highlight along the crown. Without it the shell is a flat blob at
          any size above about 60 pixels. */}
      <path
        d="M32 11.5c-8.5 0-15.3 5.4-17.8 13.6C17.8 19.4 24.3 15.5 32 15.5s14.2 3.9 17.8 9.6C47.3 16.9 40.5 11.5 32 11.5z"
        fill="#fff"
        fillOpacity="0.26"
      />

      {/* Ear holes. One small detail that fixes the helmet as football rather
          than as generic armour. */}
      <circle cx="14.6" cy="37" r="2.1" fill="#0b0809" fillOpacity="0.45" />
      <circle cx="49.4" cy="37" r="2.1" fill="#0b0809" fillOpacity="0.45" />

      <path d={FACE} fill="#09070880" />
      <path d={FACE} fill="#0b0809" fillOpacity="0.72" />

      {/* The cage: three runners and a centre post, mounted wider than the
          opening because that is where a facemask actually bolts on. */}
      <g
        stroke="#f2eef0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.92"
        fill="none"
      >
        <path d="M18.5 35.5h27" />
        <path d="M20 42h24" />
        <path d="M25 48h14" />
        <path d="M32 31v19.5" />
      </g>

      <Ornament kind={kind} from={from} to={to} place="front" />
    </svg>
  );
}

/**
 * Pad width is the fighter's build.
 *
 * A wide receiver and a nose tackle wearing the same shoulders would make three
 * of the six interchangeable from across a list.
 */
function Pads({ kind, fill }: { kind: string; fill: string }) {
  const spread =
    kind === 'juggernaut' || kind === 'bulwark' ? 5 : kind === 'streak' || kind === 'gunslinger' ? -4 : 0;

  const left = 4 - spread;
  const right = 60 + spread;

  return (
    <g>
      <path
        d={`M${left} 64c0-10 5.5-16.5 14-18h28c8.5 1.5 14 7.5 14 18z`}
        transform={spread !== 0 ? `translate(${spread ? 0 : 0} 0)` : undefined}
        fill={fill}
      />
      {/* A seam across the chest plate, so the pads are not one solid lump. */}
      <path
        d={`M${left + 5} 58h${right - left - 10}`}
        stroke="#000"
        strokeOpacity="0.26"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

function Ornament({
  kind,
  from,
  to,
  place,
}: {
  kind: string;
  from: string;
  to: string;
  place: 'behind' | 'front';
}) {
  // Linebacker: the centurion's brush crest, and a ridge down the crown.
  if (kind === 'centurion') {
    return place === 'behind' ? (
      <g fill={to}>
        <path d="M32 0c-3.8 0-6.2 3.2-6.9 9L24.6 16h14.8l-.5-7c-.7-5.8-3.1-9-6.9-9z" />
        <path d="M27 5h10M26.4 10h11.2" stroke={from} strokeOpacity="0.45" strokeWidth="1.3" fill="none" />
      </g>
    ) : (
      <path d="M30.2 12h3.6v15h-3.6z" fill={to} fillOpacity="0.5" />
    );
  }

  // Nose tackle: bull horns, swept wide and low off the ear holes.
  if (kind === 'juggernaut') {
    return place === 'behind' ? (
      <g fill={to}>
        <path d="M16.5 24C9 18.5 2.5 19 0 26c4.5-3 10-2 15 3z" />
        <path d="M47.5 24C55 18.5 61.5 19 64 26c-4.5-3-10-2-15 3z" />
      </g>
    ) : null;
  }

  // Edge rusher: blades raked back off the shell.
  if (kind === 'blitzer') {
    return place === 'behind' ? (
      <g fill={to}>
        <path d="M17.5 19 3 6l8.5 17.5z" />
        <path d="M46.5 19 61 6l-8.5 17.5z" />
      </g>
    ) : null;
  }

  // Receiver: speed wings, the oldest shorthand in sport for fast.
  if (kind === 'streak') {
    return place === 'behind' ? (
      <g fill={from}>
        <path d="M17.5 25 0 17l15.5 3.5L2 9l17 10z" />
        <path d="M17 30.5 2 28.5l14.5-.5z" fillOpacity="0.72" />
        <path d="M46.5 25 64 17l-15.5 3.5L62 9 45 19z" />
        <path d="M47 30.5 62 28.5l-14.5-.5z" fillOpacity="0.72" />
      </g>
    ) : null;
  }

  // Quarterback: a laurel, because the arm that wins it gets crowned.
  if (kind === 'gunslinger') {
    // Leaves hug the shell rather than sticking out from it — swept outwards
    // they looked like a second pair of wings, and Streak already has those.
    const leaf = (x: number, y: number, rotation: number, key: string) => (
      <ellipse key={key} cx={x} cy={y} rx="3.4" ry="1.8" transform={`rotate(${rotation} ${x} ${y})`} />
    );
    return place === 'front' ? (
      <g fill={from}>
        {[0, 1, 2, 3].map((i) => leaf(15.8 + i * 1.9, 37 - i * 6, -68 - i * 9, `l${i}`))}
        {[0, 1, 2, 3].map((i) => leaf(48.2 - i * 1.9, 37 - i * 6, 68 + i * 9, `r${i}`))}
      </g>
    ) : null;
  }

  // Left tackle: the shield. The only fighter who brings cover.
  if (kind === 'bulwark') {
    return place === 'front' ? (
      <g>
        <path d="M46 28c6.5 0 11 2 13 3.2v10.3c0 7.6-5.4 13.2-13 16.5-7.6-3.3-13-8.9-13-16.5V31.2c2-1.2 6.5-3.2 13-3.2z" fill={to} />
        <path
          d="M46 28c6.5 0 11 2 13 3.2v10.3c0 7.6-5.4 13.2-13 16.5-7.6-3.3-13-8.9-13-16.5V31.2c2-1.2 6.5-3.2 13-3.2z"
          fill="none"
          stroke="#f2eef0"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <path d="M46 34v19" stroke="#f2eef0" strokeOpacity="0.5" strokeWidth="1.4" />
      </g>
    ) : null;
  }

  return null;
}
