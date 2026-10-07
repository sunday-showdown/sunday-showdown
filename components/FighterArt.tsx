'use client';

import { useId } from 'react';
import { archetypeOf, bannerOf } from '@/lib/fighters';

/**
 * A fighter, drawn.
 *
 * Six players from a modern football game, not six warriors. The mix is about
 * 70% football, 20% gladiator, 10% street: the equipment is real kit pushed a
 * little further — reinforced pads, metallic trim, a tinted visor, tactical
 * straps — rather than armour from somewhere else. The first pass drifted:
 * crests, bull horns and a laurel wreath made the arena the dominant identity
 * and the sport the decoration. Horns became pad studs, the laurel became a
 * captain's patch, and the plume became a helmet stripe.
 *
 * Bright on purpose. These sit on a near-black UI and an unlit figure
 * disappears into it, so every one of them carries a strong top-left highlight,
 * a metallic rim on the pads and a saturated visor. The face opening is a warm
 * shadow rather than a hole — a black void under a cage is the single thing
 * that made the early drafts read as horror.
 *
 * One 96-unit grid in three bands, so a seventh fighter is a matter of filling
 * them in rather than re-deriving where anything sits:
 *
 *   y 10–20  whatever tops the helmet
 *   y 16–70  the helmet, with the visor and cage across its lower half
 *   y 66–96  pads and collar, running off the bottom edge
 *
 * Nothing here is random or stateful. The kit takes the fighter's banner
 * colours so the same fighter is the same player on every screen, and it is one
 * inline SVG rather than six image files.
 */

type Kind =
  | 'captain'
  | 'speedster'
  | 'playmaker'
  | 'bruiser'
  | 'enforcer'
  | 'juggernaut';

/** How each player is built, which is most of what tells them apart in a list. */
const BUILD: Record<Kind, { pads: number; shell: number; brow: number }> = {
  captain: { pads: 0, shell: 0, brow: 0 },
  speedster: { pads: -7, shell: -3, brow: -1 },
  playmaker: { pads: -3, shell: -1, brow: 0 },
  bruiser: { pads: 7, shell: 2, brow: 2 },
  enforcer: { pads: 3, shell: 1, brow: 3 },
  juggernaut: { pads: 11, shell: 4, brow: 2 },
};

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
  const glass = `gl-${uid}`;
  const chrome = `cr-${uid}`;

  const meta = archetypeOf(archetype);
  const kind = meta.id as Kind;
  const build = BUILD[kind] ?? BUILD.captain;
  const { from, to } = bannerOf(banner);
  const visor = meta.visor;

  const w = build.shell;

  // The shell, widened or narrowed per build. A receiver's helmet is not a nose
  // tackle's, and at 44 pixels the outline is most of what you can tell apart.
  const helmet =
    `M${22 - w} 52 C${22 - w} 30 ${32 - w} 20 48 20 C${64 + w} 20 ${74 + w} 30 ${74 + w} 52` +
    ` L${74 + w} 57 C${74 + w} 67 ${64 + w} 73 48 73 C${32 - w} 73 ${22 - w} 67 ${22 - w} 57 Z`;

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`${meta.name}, ${meta.position}`}
    >
      <defs>
        <linearGradient id={shell} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={lighten(from, 0.28)} />
          <stop offset="55%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <linearGradient id={pads} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <linearGradient id={glass} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={visor} stopOpacity="0.95" />
          <stop offset="60%" stopColor={visor} stopOpacity="0.55" />
          <stop offset="100%" stopColor={visor} stopOpacity="0.85" />
        </linearGradient>
        {/* Metallic trim. Three stops, because two reads as plastic. */}
        <linearGradient id={chrome} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#c7d0dc" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <Pads kind={kind} spread={build.pads} fill={`url(#${pads})`} trim={`url(#${chrome})`} accent={visor} />

      {/* Collar, behind the helmet. Dark, so the helmet reads as sitting in
          front of something rather than floating. */}
      <path d="M34 62h28v14a7 7 0 0 1-7 7H41a7 7 0 0 1-7-7z" fill="#171114" />

      <path d={helmet} fill={`url(#${shell})`} />

      {/* Clean light from the upper left: the single biggest difference between
          "modern sports game" and "grimdark". */}
      <path
        d={`M48 20C${34 - w} 20 ${24 - w} 30 ${23 - w} 47c4-13 13-21 25-23z`}
        fill="#ffffff"
        fillOpacity="0.34"
      />

      {/* Helmet stripe, the way every real shell is painted. */}
      <path d="M44 20.4h8V50h-8z" fill={`url(#${chrome})`} opacity="0.5" />

      <Crown kind={kind} w={w} accent={visor} trim={`url(#${chrome})`} />

      {/* The face. A warm shadow, never a void. */}
      <path d="M31 46h34v15c0 8-7 13-17 13s-17-5-17-13z" fill="#3d2c2e" />
      <path d="M31 46h34v8H31z" fill="#261b1d" opacity="0.5" />

      {/* Visor. */}
      <Visor kind={kind} glass={`url(#${glass})`} accent={visor} />

      {/* Facemask. Light metal over the shadow, bar pattern per position — a
          quarterback can see, a nose tackle is behind a grill. */}
      <Cage kind={kind} trim={`url(#${chrome})`} />

      {/* Chin strap, buckled to the shell. */}
      <path
        d={`M${28 - w} 60c1 9 8 15 20 15s19-6 20-15`}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <Accessory kind={kind} spread={build.pads} accent={visor} trim={`url(#${chrome})`} />
    </svg>
  );
}

/**
 * Shoulder pads.
 *
 * Width is the build. A metallic rim along the top edge and a seam across the
 * chest keep them from reading as one solid lump at small sizes.
 */
function Pads({
  kind,
  spread,
  fill,
  trim,
  accent,
}: {
  kind: Kind;
  spread: number;
  fill: string;
  trim: string;
  accent: string;
}) {
  const left = 4 - spread;
  const right = 92 + spread;

  return (
    <g>
      <path
        d={`M${left} 96c0-18 9-28 22-30h20c13 2 22 12 22 30z`}
        fill={fill}
      />
      {/* Lit top edge. */}
      <path
        d={`M${left + 2} 93c1-14 9-22 21-24h18c12 2 20 10 21 24`}
        fill="none"
        stroke={trim}
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d={`M${left + 10} 87h${right - left - 20}`}
        stroke="#000000"
        strokeOpacity="0.25"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Asymmetric plate on one shoulder: the one Mad Max note that belongs,
          because real pads are strapped and layered too. */}
      <path
        d={`M${left + 2} 96c0-11 5-18 13-20l6 5-4 15z`}
        fill={accent}
        fillOpacity={kind === 'speedster' || kind === 'captain' ? 0.35 : 0.55}
      />

      {/* Studs on the heavy builds. These replaced the bull horns: same
          aggression, and nobody mistakes them for a fantasy helmet. */}
      {(kind === 'enforcer' || kind === 'juggernaut' || kind === 'bruiser') && (
        <g fill={trim}>
          <circle cx={right - 12} cy={80} r="2.6" />
          <circle cx={right - 20} cy={86} r="2.6" />
          <circle cx={right - 6} cy={87} r="2.6" />
        </g>
      )}
    </g>
  );
}

/** What tops the helmet. Kit, not costume. */
function Crown({ kind, w, accent, trim }: { kind: Kind; w: number; accent: string; trim: string }) {
  // Aero fins, the way a modern speed helmet is vented.
  if (kind === 'speedster') {
    return (
      <g fill={accent} opacity="0.75">
        <path d={`M${28 - w} 37h9l-2 3h-9z`} />
        <path d={`M${30 - w} 43h9l-2 3h-9z`} />
        <path d={`M${61 + w} 37h9l-2 3h-9z`} />
        <path d={`M${59 + w} 43h9l-2 3h-9z`} />
      </g>
    );
  }

  // A raised centre ridge, like a reinforced shell.
  if (kind === 'enforcer') {
    return (
      <g>
        <path d="M42 46c0-16 2-24 6-26 4 2 6 10 6 26z" fill={accent} opacity="0.9" />
        <path d="M48 21v24" stroke={trim} strokeWidth="1.8" fill="none" opacity="0.8" />
      </g>
    );
  }

  // A roll bar across the crown on the biggest player.
  if (kind === 'juggernaut') {
    return (
      <path
        d={`M${28 - w} 36c5-10 11-15 20-15s15 5 20 15`}
        fill="none"
        stroke={trim}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.85"
      />
    );
  }

  return null;
}

/** Visor style. A quarterback sees; a fullback wants to be seen. */
function Visor({ kind, glass, accent }: { kind: Kind; glass: string; accent: string }) {
  // No visor: bare eyes under the brow, with eye black.
  if (kind === 'bruiser') {
    return (
      <g>
        <path d="M36 51h9v5h-9z" fill="#120d0f" />
        <path d="M51 51h9v5h-9z" fill="#120d0f" />
        <path d="M35 58h10v3H35zM51 58h10v3H51z" fill="#120d0f" opacity="0.8" />
      </g>
    );
  }

  // A half visor leaves the eyes visible above it.
  if (kind === 'playmaker') {
    return (
      <g>
        <path d="M36 50h8v5h-8zM52 50h8v5h-8z" fill="#120d0f" />
        <path d="M32 57h32v4c0 1-1 2-2 2H34c-1 0-2-1-2-2z" fill={glass} />
        <path d="M35 58h11" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="1.5" />
      </g>
    );
  }

  return (
    <g>
      <path d="M32 47h32v9c0 3-6 5-16 5s-16-2-16-5z" fill={glass} />
      {/* One diagonal streak reads as glass rather than as paint. */}
      <path d="M37 48l-3 11h5l3-11z" fill="#ffffff" fillOpacity="0.55" />
      <path d="M32 47h32" stroke={accent} strokeWidth="1.8" opacity="0.95" />
    </g>
  );
}

/** Facemask. The bar pattern is the position. */
function Cage({ kind, trim }: { kind: Kind; trim: string }) {
  const bars =
    kind === 'captain'
      ? ['M29 64h38', 'M33 71h30']
      : kind === 'speedster'
        ? ['M29 64h38', 'M32 70h32']
        : kind === 'playmaker'
          ? ['M29 63h38', 'M31 69h34', 'M35 74h26']
          : kind === 'bruiser'
            ? ['M28 61h40', 'M29 67h38', 'M32 72h32', 'M36 76h24']
            : kind === 'enforcer'
              ? ['M28 61h40', 'M30 67h36', 'M34 73h28']
              : ['M28 59h40', 'M28 64h40', 'M30 69h36', 'M33 74h30'];

  const posts = kind === 'juggernaut' || kind === 'bruiser' ? [38, 48, 58] : [48];

  return (
    <g strokeLinecap="round" fill="none">
      {/* Drawn twice: a dark pass underneath so the bars hold their shape
          against a light visor, then the metal on top. At 44 pixels a single
          thin stroke vanished and the helmet read as a motorcycle lid. */}
      <g stroke="#120d0f" strokeOpacity="0.55" strokeWidth="4.6">
        {bars.map((d) => (
          <path key={d} d={d} />
        ))}
        {posts.map((x) => (
          <path key={x} d={`M${x} 57v20`} />
        ))}
      </g>
      <g stroke={trim} strokeWidth="3">
        {bars.map((d) => (
          <path key={d} d={d} />
        ))}
        {posts.map((x) => (
          <path key={x} d={`M${x} 57v20`} strokeWidth="2.8" />
        ))}
      </g>
    </g>
  );
}

/** One thing each player carries that nobody else does. */
function Accessory({
  kind,
  spread,
  accent,
  trim,
}: {
  kind: Kind;
  spread: number;
  accent: string;
  trim: string;
}) {
  const left = 8 - spread;

  // The captain's patch, where a real captain wears it.
  if (kind === 'captain') {
    return (
      <g>
        <circle cx={left + 13} cy={84} r="6" fill="#0d0a0b" fillOpacity="0.55" />
        <circle cx={left + 13} cy={84} r="6" fill="none" stroke={trim} strokeWidth="1.5" />
        <path
          d={`M${left + 15.6} 81.4a3.4 3.4 0 1 0 0 5.2`}
          fill="none"
          stroke={accent}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    );
  }

  // A towel at the waist, the way a back plays.
  if (kind === 'playmaker') {
    return <path d="M60 86h9v10h-9z" fill="#ffffff" fillOpacity="0.8" />;
  }

  // Taped forearm.
  if (kind === 'speedster') {
    return (
      <g stroke="#ffffff" strokeOpacity="0.75" strokeWidth="2" strokeLinecap="round">
        <path d="M16 90h10" />
        <path d="M14 95h12" />
      </g>
    );
  }

  return null;
}

/** Mix a hex colour towards white, for the lit face of the shell. */
function lighten(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const channel = (at: number) => {
    const base = parseInt(full.slice(at, at + 2), 16);
    return Math.round(base + (255 - base) * amount);
  };
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
}
