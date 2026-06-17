/** Scheduled (struck) + actual/predicted time display. */
export function TimePair({
  scheduled,
  predicted,
  size = "md",
  align = "right",
  showStruckWhenEqual = false,
}: {
  scheduled: string;
  predicted?: string;
  size?: "sm" | "md" | "lg";
  align?: "left" | "right";
  showStruckWhenEqual?: boolean;
}) {
  const actual = predicted ?? scheduled;
  const showStruck =
    predicted != null && (showStruckWhenEqual || predicted !== scheduled);

  const mainSize =
    size === "lg"
      ? "text-lg font-bold"
      : size === "sm"
        ? "text-sm font-bold tabular-nums"
        : "text-base font-bold sm:text-lg";

  return (
    <span
      className={`inline-flex flex-col tabular-nums leading-tight ${
        align === "right" ? "items-end" : "items-start"
      }`}
    >
      <span className={`text-go-navy ${mainSize}`}>{actual}</span>
      {showStruck && (
        <span className="text-[0.625rem] text-go-slate line-through sm:text-[10px]">{scheduled}</span>
      )}
    </span>
  );
}

export function shouldShowStruckSchedule(
  realtime: boolean,
  scheduled: string,
  predicted?: string,
): boolean {
  if (!realtime || predicted == null) return false;
  return predicted !== scheduled;
}
