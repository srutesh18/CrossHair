/** Loading, empty and error states. Every page uses these - no bare blanks. */

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
      <span
        aria-hidden
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      {label}
    </span>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16" role="status">
      <Spinner label={label} />
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-[12px]"
          style={{ background: "var(--color-raise)" }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[14px] border border-dashed px-6 py-14 text-center"
      style={{ borderColor: "var(--color-line)" }}
    >
      <p className="font-semibold">{title}</p>
      {hint ? (
        <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--color-muted)" }}>
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div
      className="rounded-[14px] px-5 py-4"
      role="alert"
      style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}
    >
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm">{message}</p>
      {retry ? (
        <button type="button" onClick={retry} className="ch-btn mt-3 text-sm">
          Try again
        </button>
      ) : null}
    </div>
  );
}
