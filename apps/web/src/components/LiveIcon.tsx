/** Transit-style live / realtime indicator (broadcast arcs). */
export function LiveIcon({
  className,
  title = "Live",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d="M12 20h.01" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M5 13a9 9 0 0 1 14 0" />
      <path d="M2 9.5a13 13 0 0 1 20 0" />
    </svg>
  );
}
