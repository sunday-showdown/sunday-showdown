/**
 * A person, as a circle.
 *
 * Nobody has uploaded an avatar, and probably nobody will, so the fallback is
 * the real case: initials on a colour derived from the username. Derived rather
 * than random, so the same person is the same colour on every screen and in
 * every message — which is what makes a chat scannable without reading names.
 */
const PALETTE = [
  '#e2353c',
  '#ef6c2a',
  '#e0a51f',
  '#2ea86a',
  '#1f9bb5',
  '#3f7ae0',
  '#8759dd',
  '#d2459b',
] as const;

function hashOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 1_000_003;
  }
  return hash;
}

export function avatarColour(username: string): string {
  return PALETTE[hashOf(username) % PALETTE.length]!;
}

const SIZES = { sm: 26, md: 34, lg: 48, xl: 64 } as const;

export default function Avatar({
  username,
  url,
  size = 'md',
}: {
  username: string;
  url?: string | null;
  size?: keyof typeof SIZES;
}) {
  const px = SIZES[size];
  const initials = username.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';

  if (url) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- avatars are
         arbitrary remote URLs; next/image would need every host allowlisted. */
      <img
        src={url}
        alt=""
        width={px}
        height={px}
        className="shrink-0 rounded-full border border-line object-cover"
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="display flex shrink-0 items-center justify-center rounded-full text-brand-ink"
      style={{
        width: px,
        height: px,
        fontSize: Math.round(px * 0.38),
        background: `linear-gradient(160deg, ${avatarColour(username)}, ${avatarColour(username)}99)`,
      }}
    >
      {initials}
    </span>
  );
}
