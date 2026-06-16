import Link from "next/link";
import { formatDelayLabel, isPlausibleDelayMin } from "@/lib/delay-label";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function BusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 6v6" />
      <path d="M15 6v6" />
      <path d="M5 20h14" />
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M4 12h16" />
    </svg>
  );
}

function RouteIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h8.5a2 2 0 0 0 1.7-1l3.5-7.5a2 2 0 0 0-1.7-3H8" />
    </svg>
  );
}

export function DepartureStatus({
  realtime,
  latenessMin,
  compact,
}: {
  realtime: boolean;
  latenessMin?: number;
  compact?: boolean;
}) {
  const label = formatDelayLabel(latenessMin);
  const late = isPlausibleDelayMin(latenessMin) && latenessMin! > 0;
  const early = isPlausibleDelayMin(latenessMin) && latenessMin! < 0;
  const onTime = realtime && latenessMin === 0;
  const scheduled = !realtime;

  let badgeClass = "go-badge go-badge--sched";
  let icon = <ClockIcon className="h-3 w-3 shrink-0 opacity-80" />;
  let text = "Scheduled";

  if (late) {
    badgeClass = "go-badge go-badge--late";
    icon = <ClockIcon className="h-3 w-3 shrink-0" />;
    text = label ?? "Late";
  } else if (early) {
    badgeClass = "go-badge go-badge--early";
    icon = <ClockIcon className="h-3 w-3 shrink-0" />;
    text = label ?? "Early";
  } else if (onTime) {
    badgeClass = "go-badge go-badge--ontime";
    icon = <CheckIcon className="h-3 w-3 shrink-0" />;
    text = "On time";
  }

  if (scheduled && !realtime) {
    return (
      <span className={`${badgeClass} inline-flex items-center gap-1 whitespace-nowrap`}>
        {icon}
        {!compact && <span>{text}</span>}
      </span>
    );
  }

  if (!late && !early && !onTime) return null;

  return (
    <span className={`${badgeClass} inline-flex items-center gap-1 whitespace-nowrap`}>
      {icon}
      {!compact && <span>{text}</span>}
    </span>
  );
}

export function DepartureActions({
  tripHref,
  vehicleHref,
  onClick,
}: {
  tripHref?: string;
  vehicleHref?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="departure-actions flex shrink-0 items-center gap-0.5">
      {vehicleHref && (
        <Link
          href={vehicleHref}
          onClick={onClick}
          className="departure-action-btn"
          title="Vehicle"
          aria-label="Vehicle"
        >
          <BusIcon className="h-4 w-4" />
        </Link>
      )}
      {tripHref && (
        <Link
          href={tripHref}
          onClick={onClick}
          className="departure-action-btn"
          title="Trip"
          aria-label="Trip"
        >
          <RouteIcon className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

export function DepartureStatusRow({
  realtime,
  latenessMin,
  tripHref,
  vehicleHref,
  onClick,
  compact,
}: {
  realtime: boolean;
  latenessMin?: number;
  tripHref: string;
  vehicleHref?: string;
  onClick?: (e: React.MouseEvent) => void;
  compact?: boolean;
}) {
  return (
    <div className="departure-status-row flex items-center justify-end gap-1.5">
      <DepartureStatus
        realtime={realtime}
        latenessMin={latenessMin}
        compact={compact}
      />
      <DepartureActions
        tripHref={tripHref}
        vehicleHref={vehicleHref}
        onClick={onClick}
      />
    </div>
  );
}
