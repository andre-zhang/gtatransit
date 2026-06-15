export function Section({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-center gap-2 border-b border-go-bg bg-go-surface px-5 py-3">
        <span className="h-4 w-1 rounded-full bg-go-green" aria-hidden />
        <h2 className="go-section-title">{title}</h2>
        {subtitle ? (
          <span className="ml-auto text-xs font-semibold tabular-nums text-go-slate">
            {subtitle}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
