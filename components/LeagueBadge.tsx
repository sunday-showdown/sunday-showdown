/** A league's picture, or its initials when it has none. */
export default function LeagueBadge({
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
