export default function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card mx-4 mt-4 px-6 py-10 text-center">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {body && <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
