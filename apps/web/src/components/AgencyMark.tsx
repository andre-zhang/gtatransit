import { AGENCY_COLORS, AGENCY_NAMES } from "@/lib/colors";

export function AgencyMark({
  feedId,
  iconOnly = false,
}: {
  feedId: string;
  iconOnly?: boolean;
}) {
  const color = AGENCY_COLORS[feedId] ?? "#64748b";
  const name = AGENCY_NAMES[feedId] ?? feedId.toUpperCase();

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-go-slate"
      title={name}
    >
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {!iconOnly && <span className="hidden sm:inline">{name}</span>}
    </span>
  );
}
