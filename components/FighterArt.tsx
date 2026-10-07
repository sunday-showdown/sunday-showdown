'use client';

import { useId } from 'react';
import { archetypeOf, bannerOf } from '@/lib/fighters';

/**
 * A fighter, drawn head to cleats.
 *
 * Built against a reference roster: six football gladiators, skill players in
 * motion and big men set in a wide stance, all carrying the same equipment
 * family — helmet and cage, asymmetric shoulder armour, a chest harness, a belt,
 * a torn sash at the waist, knee pads, cleats. Roughly 70% football, 20%
 * gladiator, 10% street. It is flat vector rather than painted, which is the
 * honest limit of drawing this by hand, so it leans on silhouette, colour and
 * pose instead of rendering.
 *
 * THREE POSES, NOT SIX. The reference has three too: one player standing, two
 * sprinting, three crouched in a power stance. Six hand-authored poses would be
 * six times the path data to maintain and would not read as six from across a
 * phone screen anyway — what separates them at a glance is build, armour and
 * colour, which is where the variation went instead.
 *
 * LIMBS ARE STROKES. Arms and legs are stroked paths with round caps rather
 * than filled outlines. A filled limb needs both edges drawn and every pose
 * redrawn from scratch; a stroked one is three points and a width, which is
 * what makes a second pose cheap and a third possible.
 *
 * NO SKIN. Every player wears a compression layer, which is ordinary modern kit
 * and also the right call for an avatar somebody else is wearing: picking a skin
 * tone for a figure that stands in for any of fifty people is a choice this
 * component has no business making.
 *
 * Two framings of one drawing. `frame="bust"` just moves the viewBox onto the
 * head and shoulders — a full body at 44 pixels in a list is a smudge, and
 * cropping is better than shipping a second drawing that could drift.
 */

type Kind = 'captain' | 'speedster' | 'playmaker' | 'bruiser' | 'enforcer' | 'juggernaut';
type Pose = 'stance' | 'sprint' | 'power';

interface Build {
  pose: Pose;
  /** Multiplies limb and shoulder width: a receiver is not a nose tackle. */
  bulk: number;
  /** Degrees of forward lean through the torso. */
  lean: number;
  spikes: boolean;
  cape: 'long' | 'stream' | 'sash' | 'none';
  helmet: 'sleek' | 'low' | 'round' | 'heavy';
}

const BUILDS: Record<Kind, Build> = {
  captain: { pose: 'stance', bulk: 1, lean: 0, spikes: false, cape: 'long', helmet: 'sleek' },
  speedster: { pose: 'sprint', bulk: 0.86, lean: -10, spikes: false, cape: 'stream', helmet: 'low' },
  playmaker: { pose: 'sprint', bulk: 0.94, lean: -5, spikes: false, cape: 'sash', helmet: 'low' },
  bruiser: { pose: 'power', bulk: 1.2, lean: 6, spikes: false, cape: 'sash', helmet: 'round' },
  enforcer: { pose: 'power', bulk: 1.12, lean: 5, spikes: true, cape: 'sash', helmet: 'heavy' },
  juggernaut: { pose: 'power', bulk: 1.34, lean: 7, spikes: true, cape: 'none', helmet: 'heavy' },
};

/** Where the limbs go, per pose. Three points each: joint, joint, end. */
const POSES: Record<Pose, { legL: string; legR: string; armL: string; armR: string }> = {
  stance: {
    legL: 'M53 112 L50 150 L49 184',
    legR: 'M67 112 L70 150 L71 184',
    armL: 'M42 60 L33 84 L40 102',
    armR: 'M78 60 L87 84 L83 104',
  },
  sprint: {
    // Front knee driving up, back leg extended and trailing.
    legL: 'M64 112 L82 134 L74 160',
    legR: 'M56 114 L36 148 L22 166',
    armL: 'M44 60 L29 76 L36 94',
    armR: 'M76 58 L93 70 L92 50',
  },
  power: {
    // Feet planted wide, knees driven out, fists low and ready.
    legL: 'M51 112 L33 146 L31 184',
    legR: 'M69 112 L87 146 L89 184',
    armL: 'M39 62 L24 92 L33 116',
    armR: 'M81 62 L96 92 L87 116',
  },
};

export default function FighterArt({
  archetype,
  banner,
  size = 48,
  frame = 'bust',
  className,
}: {
  archetype: string;
  banner: string;
  size?: number;
  /** 'bust' crops to the helmet and pads; 'full' shows the whole figure. */
  frame?: 'bust' | 'full';
  className?: string;
}) {
  // Gradient ids are document-global, so several fighters on one screen would
  // otherwise all paint with whichever defs rendered last.
  const uid = useId().replace(/:/g, '');
  const kit = `kit-${uid}`;
  const metal = `mtl-${uid}`;
  const glassId = `gls-${uid}`;

  const meta = archetypeOf(archetype);
  const kind = meta.id as Kind;
  const build = BUILDS[kind] ?? BUILDS.captain;
  const pose = POSES[build.pose];
  const { from, to } = bannerOf(banner);
  const visor = meta.visor;

  // The compression layer has to be a mid-tone, not near-black. The first pass
  // used #191317 and the limbs disappeared into a #070506 background entirely,
  // leaving a head, a chest and a scatter of knee pads floating in the dark.
  // This also satisfies the rule that a fighter should survive a light
  // background as well as this one.
  const SUIT = '#7a6d78';
  const SUIT_DEEP = '#574c56';
  // Heavier than the first pass. These are armoured athletes, and slim strokes
  // read as a stick figure in kit rather than as somebody who hits people.
  const limb = 13.5 * build.bulk;
  const arm = 10.5 * build.bulk;

  // A full figure at 44 pixels is a smudge, so small placements crop to the
  // head and shoulders instead of shrinking the whole body.
  const viewBox = frame === 'full' ? '0 0 120 200' : '26 2 68 62';
  const ratio = frame === 'full' ? 200 / 120 : 62 / 68;

  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={Math.round(size * ratio)}
      className={className}
      role="img"
      aria-label={`${meta.name}, ${meta.position}`}
    >
      <defs>
        <linearGradient id={kit} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={lighten(from, 0.3)} />
          <stop offset="55%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#c3ccd8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={glassId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={visor} stopOpacity="0.95" />
          <stop offset="65%" stopColor={visor} stopOpacity="0.55" />
          <stop offset="100%" stopColor={visor} stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Cape first: it hangs behind everything. */}
      <Cape style={build.cape} pose={build.pose} fill={`url(#${kit})`} />

      <g transform={`rotate(${build.lean} 60 110)`}>
        {/* Back arm, then body, then front arm, so the figure has depth
            without any of it being drawn twice. */}
        {/* The far arm is a shade deeper, which is the whole of the depth
            cueing and costs nothing. */}
        <Limb d={pose.armR} width={arm} colour={SUIT_DEEP} />
        <Glove d={pose.armR} colour={`url(#${kit})`} />

        <Legs pose={pose} width={limb} dark={SUIT} kit={`url(#${kit})`} metal={`url(#${metal})`} />
        {/* Neck, so the helmet sits on the body instead of hovering over it. */}
        <path d="M53 40h14v16H53z" fill={SUIT_DEEP} />
        <Torso bulk={build.bulk} kit={`url(#${kit})`} dark={SUIT_DEEP} metal={`url(#${metal})`} />

        <Limb d={pose.armL} width={arm} colour={SUIT} />
        <Glove d={pose.armL} colour={`url(#${kit})`} />

        <Shoulders bulk={build.bulk} spikes={build.spikes} kit={`url(#${kit})`} metal={`url(#${metal})`} />
        <Head kind={kind} shape={build.helmet} kit={`url(#${kit})`} metal={`url(#${metal})`} glass={`url(#${glassId})`} accent={visor} />
      </g>
    </svg>
  );
}

/** A limb: one stroke, round caps, no outline to keep in sync. */
function Limb({ d, width, colour }: { d: string; width: number; colour: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={colour}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** A glove at the end of an arm, in the kit colour so the hand reads. */
function Glove({ d, colour }: { d: string; colour: string }) {
  const points = d.match(/-?\d+(\.\d+)?/g) ?? [];
  const x = Number(points[points.length - 2] ?? 0);
  const y = Number(points[points.length - 1] ?? 0);
  return <circle cx={x} cy={y} r="5.4" fill={colour} />;
}

function Legs({
  pose,
  width,
  dark,
  kit,
  metal,
}: {
  pose: { legL: string; legR: string };
  width: number;
  dark: string;
  kit: string;
  metal: string;
}) {
  return (
    <g>
      {[pose.legR, pose.legL].map((d, index) => {
        const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
        const [, , kneeX, kneeY, footX, footY] = n;
        return (
          <g key={index}>
            <Limb d={d} width={width} colour={dark} />
            {/* Knee pad and cleat: the two pieces that stop a leg reading as a
                tube with a dot on the end. */}
            <circle cx={kneeX} cy={kneeY} r={width * 0.56} fill={kit} opacity="0.95" />
            <path
              d={`M${footX! - 7} ${footY! - 2}h14a3 3 0 0 1 3 3v3a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-3a3 3 0 0 1 3-3z`}
              fill={kit}
            />
            <path
              d={`M${footX! - 6} ${footY! + 6}h13`}
              stroke={metal}
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        );
      })}
    </g>
  );
}

function Torso({ bulk, kit, dark, metal }: { bulk: number; kit: string; dark: string; metal: string }) {
  const w = 20 * bulk;

  return (
    <g>
      {/* Compression layer under the armour. */}
      <path
        d={`M${60 - w} 54h${w * 2}l${-w * 0.2} 56h${-w * 1.6}z`}
        fill={dark}
      />
      {/* Chest plate. */}
      <path
        d={`M${60 - w * 0.92} 56h${w * 1.84}l${-w * 0.18} 30q${-w * 0.74} 7 ${-w * 1.48} 0z`}
        fill={kit}
      />
      <path
        d={`M60 58v28`}
        stroke="#000000"
        strokeOpacity="0.22"
        strokeWidth="1.6"
      />
      {/* Harness straps, the one Mad Max note that belongs on real kit. */}
      <path
        d={`M${60 - w * 0.8} 62L60 72l${w * 0.8} -10`}
        fill="none"
        stroke={metal}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* Belt and buckle. */}
      <path d={`M${60 - w * 0.95} 98h${w * 1.9}v8h${-w * 1.9}z`} fill={dark} />
      <path d={`M${60 - w * 0.95} 98h${w * 1.9}`} stroke={metal} strokeWidth="2" opacity="0.8" />
      <circle cx="60" cy="102" r="3.4" fill={metal} />
    </g>
  );
}

/** Asymmetric shoulder armour, spiked on the heavy builds. */
function Shoulders({
  bulk,
  spikes,
  kit,
  metal,
}: {
  bulk: number;
  spikes: boolean;
  kit: string;
  metal: string;
}) {
  const w = 23 * bulk;

  return (
    <g>
      {/* One big pauldron and one plated shoulder. The asymmetry is most of what
          makes the silhouette read as kit rather than as a uniform, and both of
          them overlap the arm joint so the armour sits on the player. */}
      <path
        d={`M${60 - w * 0.95} 66q${-w * 0.12} -20 ${w * 0.42} -22q${w * 0.3} 2 ${w * 0.34} 10l-1 13z`}
        fill={kit}
      />
      <path
        d={`M${60 - w * 0.9} 54q${w * 0.1} -8 ${w * 0.4} -9`}
        fill="none"
        stroke={metal}
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d={`M${60 + w * 0.2} 48q${w * 0.34} -6 ${w * 0.62} -3q${w * 0.2} 5 ${w * 0.16} 16l-${w * 0.86} 2z`}
        fill={kit}
      />
      <path
        d={`M${60 + w * 0.26} 54h${w * 0.5}`}
        stroke={metal}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.8"
        fill="none"
      />

      {spikes && (
        <g fill={metal}>
          <path d={`M${60 - w * 0.92} 46l3.5-10 3.5 10z`} />
          <path d={`M${60 - w * 0.6} 42l3.5-10 3.5 10z`} />
          <path d={`M${60 + w * 0.34} 44l3.5-10 3.5 10z`} />
          <path d={`M${60 + w * 0.64} 47l3.5-10 3.5 10z`} />
        </g>
      )}
    </g>
  );
}

/** The helmet, which is the one part that must still read at 44 pixels. */
function Head({
  kind,
  shape,
  kit,
  metal,
  glass,
  accent,
}: {
  kind: Kind;
  shape: Build['helmet'];
  kit: string;
  metal: string;
  glass: string;
  accent: string;
}) {
  const w = shape === 'heavy' ? 3 : shape === 'round' ? 1.5 : shape === 'low' ? -1.5 : 0;

  return (
    <g>
      <path
        d={`M${42 - w} 28 C${42 - w} 14 ${49 - w} 7 60 7 C${71 + w} 7 ${78 + w} 14 ${78 + w} 28` +
          ` L${78 + w} 32 C${78 + w} 40 ${71 + w} 44 60 44 C${49 - w} 44 ${42 - w} 40 ${42 - w} 32 Z`}
        fill={kit}
      />
      {/* Lit from the upper left, so the shell is not a flat disc. */}
      <path
        d={`M60 7C${48 - w} 7 ${43 - w} 14 ${42.5 - w} 26c3-8 9-13 17.5-14z`}
        fill="#ffffff"
        fillOpacity="0.32"
      />
      <path d="M57 7.3h6V26h-6z" fill={metal} opacity="0.5" />

      {/* Face: a warm shadow, never a hole. */}
      <path d="M49 26h22v9c0 5-4 8-11 8s-11-3-11-8z" fill="#3d2c2e" />

      {/* Visor, then the cage over it. */}
      {kind === 'bruiser' ? (
        <g fill="#120d0f">
          <path d="M51 28h6v3h-6zM63 28h6v3h-6z" />
        </g>
      ) : (
        <>
          <path d="M49 27h22v6c0 2-4 3-11 3s-11-1-11-3z" fill={glass} />
          <path d="M52 27.5l-2 7h3l2-7z" fill="#ffffff" fillOpacity="0.55" />
          <path d="M49 27h22" stroke={accent} strokeWidth="1.2" opacity="0.95" />
        </>
      )}

      <Cage kind={kind} metal={metal} />

      <path
        d={`M${47 - w} 36c1 5 5 8 13 8s12-3 13-8`}
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.45"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </g>
  );
}

function Cage({ kind, metal }: { kind: Kind; metal: string }) {
  const bars =
    kind === 'captain' || kind === 'speedster'
      ? ['M47 37h26']
      : kind === 'playmaker'
        ? ['M47 36h26', 'M50 41h20']
        : kind === 'bruiser'
          ? ['M46 34h28', 'M47 38h26', 'M50 42h20']
          : kind === 'enforcer'
            ? ['M46 34h28', 'M48 39h24']
            : ['M46 33h28', 'M46 37h28', 'M49 41h22'];

  const posts = kind === 'juggernaut' || kind === 'bruiser' ? [54, 60, 66] : [60];

  return (
    <g strokeLinecap="round" fill="none">
      {/* A dark pass under the metal, so the bars hold against a light visor.
          A single thin stroke vanishes at list size and the helmet stops
          reading as football at all. */}
      <g stroke="#120d0f" strokeOpacity="0.5" strokeWidth="3">
        {bars.map((d) => (
          <path key={d} d={d} />
        ))}
        {posts.map((x) => (
          <path key={x} d={`M${x} 31v12`} />
        ))}
      </g>
      <g stroke={metal} strokeWidth="1.9">
        {bars.map((d) => (
          <path key={d} d={d} />
        ))}
        {posts.map((x) => (
          <path key={x} d={`M${x} 31v12`} strokeWidth="1.7" />
        ))}
      </g>
    </g>
  );
}

/** What hangs off them: a cape, a streaming sash, or a torn tasset. */
function Cape({ style, pose, fill }: { style: Build['cape']; pose: Pose; fill: string }) {
  if (style === 'none') return null;

  if (style === 'long') {
    return (
      <path
        d="M44 52q-12 10-12 34l6 40 8-6 5 8 6-44q-7-16-13-32z"
        fill={fill}
        opacity="0.9"
      />
    );
  }

  if (style === 'stream') {
    // Caught by the run, trailing behind the back leg.
    return (
      <path
        d={pose === 'sprint' ? 'M56 92q-22 6-40 26l16-2-10 12 14-4-2 10 26-28z' : 'M56 92q-20 8-30 28l30-14z'}
        fill={fill}
        opacity="0.92"
      />
    );
  }

  // A torn tasset at the waist, the gladiator note that reads at any size.
  return (
    <path
      d="M44 100h32l-3 30-5-8-5 12-5-10-5 8-4-10z"
      fill={fill}
      opacity="0.88"
    />
  );
}

/** Mix a hex colour towards white, for the lit face of the kit. */
function lighten(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const channel = (at: number) => {
    const base = parseInt(full.slice(at, at + 2), 16);
    return Math.round(base + (255 - base) * amount);
  };
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
}
