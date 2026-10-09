export function Topbar({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: string;
  children?: React.ReactNode;
}) {
  return (
    <header
      className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5"
      style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}
    >
      <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
      {tag ? <span className="ch-tag">{tag}</span> : null}
      <div className="flex-1" />
      {children}
    </header>
  );
}
