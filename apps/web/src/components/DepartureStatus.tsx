import Link from "next/link";
import { formatDelayLabel, isPlausibleDelayMin } from "@/lib/delay-label";
import { LiveIcon } from "./LiveIcon";

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

function ScheduledIcon({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 3.5 3.5" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function statusTitle(realtime: boolean, latenessMin?: number): string {
  if (!realtime) return "Scheduled";
  const label = formatDelayLabel(latenessMin);
  const late = isPlausibleDelayMin(latenessMin) && latenessMin! > 0;
  const early = isPlausibleDelayMin(latenessMin) && latenessMin! < 0;
  if (late) return label ?? "Late";
  if (early) return label ?? "Early";
  return "On time";
}

/** Icon-only status: grey ? when scheduled, green live arcs when on time/early, red when late. */
export function DepartureStatus({
  realtime,
  latenessMin,
}: {
  realtime: boolean;
  latenessMin?: number;
  compact?: boolean;
}) {
  if (!realtime) {
    return (
      <ScheduledIcon
        className="h-4 w-4 shrink-0 text-go-slate"
        title={statusTitle(false)}
      />
    );
  }

  const late = isPlausibleDelayMin(latenessMin) && latenessMin! > 0;
  const colorClass = late ? "text-go-late" : "text-[#007934]";

  return (
    <LiveIcon
      className={`h-4 w-4 shrink-0 ${colorClass}`}
      title={statusTitle(realtime, latenessMin)}
    />
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

export function DepartureActionLinks({
  tripHref,
  vehicleHref,
  onClick,
}: {
  tripHref?: string;
  vehicleHref?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <DepartureActions
      tripHref={tripHref}
      vehicleHref={vehicleHref}
      onClick={onClick}
    />
  );
}

export function DepartureStatusRow({
  realtime,
  latenessMin,
  tripHref,
  vehicleHref,
  onClick,
  part = "all",
}: {
  realtime: boolean;
  latenessMin?: number;
  tripHref: string;
  vehicleHref?: string;
  feedId?: string;
  vehicleId?: string;
  onClick?: (e: React.MouseEvent) => void;
  compact?: boolean;
  part?: "all" | "live" | "actions";
}) {
  if (part === "live") {
    return <DepartureStatus realtime={realtime} latenessMin={latenessMin} />;
  }
  if (part === "actions") {
    return (
      <DepartureActions
        tripHref={tripHref}
        vehicleHref={vehicleHref}
        onClick={onClick}
      />
    );
  }

  return (
    <div className="departure-status-row flex items-center justify-end gap-1.5">
      <DepartureStatus realtime={realtime} latenessMin={latenessMin} />
      <DepartureActions
        tripHref={tripHref}
        vehicleHref={vehicleHref}
        onClick={onClick}
      />
    </div>
  );
}
