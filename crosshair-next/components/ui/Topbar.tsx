export function Topbar({
  title,
  tag,
  subtitle,
  children,
}: {
  title: string;
  tag?: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b px-6 py-3.5"
      style={{ borderColor: "var(--color-line)", background: "color-mix(in srgb, var(--color-surface) 82%, transparent)", backdropFilter: "saturate(1.4) blur(10px)" }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[21px] font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{title}</h1>
          {tag ? <span className="ch-tag">{tag}</span> : null}
        </div>
        {subtitle ? <p className="text-[12px]" style={{ color: "var(--color-muted)" }}>{subtitle}</p> : null}
      </div>
      <div className="flex-1" />
      {children}
    </header>
  );
}
