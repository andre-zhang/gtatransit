import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { RunMap } from "@/components/RunMap";
import { Section } from "@/components/Section";
import { serverBaseUrl } from "@/lib/server-base-url";

async function load(feedId: string, vehicleId: string) {
  const base = await serverBaseUrl();
  const res = await fetch(
    `${base}/api/runs/${feedId}/${encodeURIComponent(vehicleId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json();
}

type UpcomingStop = {
  stop_id: string;
  name: string;
  scheduled: string;
  predicted?: string;
  platform?: string;
  delayMin?: number;
};

export default async function RunPage({
  params,
}: {
  params: Promise<{ feedId: string; vehicleId: string }>;
}) {
  const { feedId, vehicleId } = await params;
  const data = await load(feedId, vehicleId);

  if (!data) {
    return (
      <PageShell>
        <div className="py-16 text-center text-go-slate">
          Vehicle not found or no longer reporting location.
        </div>
      </PageShell>
    );
  }

  const { vehicle, trip, route, currentStop, upcomingStops, shape, blockTrips } = data as {
    vehicle: {
      id: string;
      label: string;
      lat: number;
      lon: number;
      bearing?: number | null;
      delayMin: number | null;
    };
    trip: { trip_id: string; route_id: string; headsign: string | null; block_id?: string | null } | null;
    route: {
      short_name: string | null;
      long_name: string | null;
      color: string;
    } | null;
    currentStop: { stop_id: string; name: string } | null;
    upcomingStops: UpcomingStop[];
    blockTrips?: Array<{
      trip_id: string;
      headsign: string | null;
      first_departure: string;
      active: boolean;
    }>;
    shape: GeoJSON.Feature | null;
  };

  const early = vehicle.delayMin != null && vehicle.delayMin < 0;
  const late = vehicle.delayMin != null && vehicle.delayMin > 0;
  const headsign =
    trip?.headsign ?? route?.long_name ?? route?.short_name ?? "In service";
  const routeLabel = route?.short_name ?? trip?.route_id ?? "?";

  return (
    <PageShell>
      <PageHeader
        title={`Vehicle ${vehicle.label}`}
        subtitle={headsign}
        routeBadge={
          route || trip
            ? {
                shortName: routeLabel,
                color: route?.color ?? "#007934",
              }
            : undefined
        }
      />

      <div className="grid grid-cols-2 divide-x divide-go-bg border-b border-go-bg sm:grid-cols-3">
        <div className="p-5">
          <div className="go-section-title mb-1">Delay</div>
          <div
            className={`text-2xl font-bold ${
              late ? "text-go-late" : early ? "text-go-slate" : "text-go-ontime"
            }`}
          >
            {late
              ? `+${vehicle.delayMin} min`
              : early
                ? `${vehicle.delayMin} min`
                : "On time"}
          </div>
        </div>
        <div className="p-5">
          <div className="go-section-title mb-1">Vehicle</div>
          <div className="text-lg font-bold text-go-navy">{vehicle.label}</div>
        </div>
        <div className="p-5 col-span-2 sm:col-span-1">
          <div className="go-section-title mb-1">Current stop</div>
          <div className="text-lg font-bold text-go-navy">{currentStop?.name ?? "—"}</div>
        </div>
      </div>

      <RunMap lat={vehicle.lat} lon={vehicle.lon} shape={shape} />

      {blockTrips && blockTrips.length > 1 && (
        <Section title="Trips in block">
          <ul className="divide-y divide-go-bg">
            {blockTrips.map((t) => (
              <li
                key={t.trip_id}
                className={`flex items-center gap-4 px-5 py-3 ${t.active ? "bg-go-bg/40" : ""}`}
              >
                <span className="w-16 shrink-0 text-right font-bold tabular-nums text-go-navy">
                  {t.first_departure}
                </span>
                <span className="min-w-0 flex-1 truncate text-go-navy">
                  {t.headsign ?? t.trip_id}
                </span>
                {t.active && (
                  <span className="go-badge go-badge--live shrink-0">Active</span>
                )}
                <Link
                  href={`/trip/${feedId}/${encodeURIComponent(t.trip_id)}`}
                  className="shrink-0 text-xs font-semibold text-go-green hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {upcomingStops?.length > 0 && (
        <Section title="Next stops">
          <ul className="divide-y divide-go-bg">
            {upcomingStops.map((s) => (
              <li
                key={`${s.stop_id}-${s.scheduled}`}
                className="flex items-center gap-4 px-5 py-3"
              >
                <span className="w-16 shrink-0 text-right text-lg font-bold tabular-nums text-go-navy">
                  {s.predicted ?? s.scheduled}
                </span>
                <span className="min-w-0 flex-1 truncate text-go-navy">{s.name}</span>
                {feedId === "go" && s.platform && (
                  <span className="shrink-0 text-sm tabular-nums text-go-slate">
                    Plat {s.platform}
                  </span>
                )}
                {s.delayMin != null && s.delayMin > 0 && (
                  <span className="go-badge go-badge--late shrink-0">+{s.delayMin}m</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {trip && (
        <div className="border-t border-go-bg px-5 py-3 text-xs text-go-slate">
          Trip {trip.trip_id}
        </div>
      )}
    </PageShell>
  );
}
