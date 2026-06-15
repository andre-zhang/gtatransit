"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDelayLabel } from "@/lib/delay-label";
import { PageEmpty } from "@/components/PageEmpty";
import { Section } from "@/components/Section";

type Trip = { trip_id: string; headsign: string | null; first_departure: string };
type Vehicle = {
  vehicle_id: string;
  label: string | null;
  headsign: string | null;
  delay_sec: number | null;
};

export function RouteViewClient({
  feedId,
  routeId,
  direction,
  directionLabels,
  trips,
  vehicles,
}: {
  feedId: string;
  routeId: string;
  direction: number;
  directionLabels?: [string, string];
  trips: Trip[];
  vehicles: Vehicle[];
}) {
  const router = useRouter();
  const labels: [string, string] = directionLabels ?? ["Outbound", "Inbound"];

  return (
    <>
      <div className="flex border-b border-go-bg bg-go-bg/50 p-1">
        {[0, 1].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() =>
              router.push(`/route/${feedId}/${encodeURIComponent(routeId)}?direction=${d}`)
            }
            className={`flex-1 rounded-sm px-2 py-2.5 text-sm font-bold transition ${
              direction === d
                ? "bg-go-surface text-go-green shadow-sm"
                : "text-go-slate hover:text-go-navy"
            }`}
          >
            <span className="block truncate">{labels[d]}</span>
          </button>
        ))}
      </div>

      {vehicles.length > 0 ? (
        <Section title="Live">
          <ul className="divide-y divide-go-bg">
            {vehicles.map((v) => {
              const delayMin =
                v.delay_sec != null ? Math.round(v.delay_sec / 60) : null;
              const late = delayMin != null && delayMin > 0;
              const early = delayMin != null && delayMin < 0;
              return (
                <li
                  key={v.vehicle_id}
                  className="flex items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3"
                >
                  <span className="w-16 shrink-0 font-bold text-go-navy sm:w-20">
                    {v.label ?? v.vehicle_id}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-go-navy">
                    {v.headsign ?? "Headsign unavailable"}
                  </span>
                  {late || early ? (
                    <span
                      className={`go-badge shrink-0 ${late ? "go-badge--late" : "go-badge--early"}`}
                    >
                      {formatDelayLabel(delayMin)}
                    </span>
                  ) : (
                    <span className="go-badge go-badge--ontime shrink-0">On time</span>
                  )}
                  <Link
                    href={`/run/${feedId}/${encodeURIComponent(v.vehicle_id)}`}
                    className="go-link shrink-0"
                  >
                    Vehicle
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : (
        <PageEmpty title="No live vehicles" hint="Nothing is reporting on this direction right now." />
      )}

      <Section title="Schedule">
        {trips.length > 0 ? (
          <ul className="max-h-[28rem] divide-y divide-go-bg overflow-y-auto">
            {trips.map((t) => (
              <li
                key={t.trip_id}
                className="flex items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3"
              >
                <span className="w-16 shrink-0 text-right text-lg font-bold tabular-nums text-go-navy sm:w-20">
                  {t.first_departure}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-go-navy">
                  {t.headsign ?? "Headsign unavailable"}
                </span>
                <Link
                  href={`/trip/${feedId}/${encodeURIComponent(t.trip_id)}`}
                  className="go-link shrink-0"
                >
                  Trip
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <PageEmpty title="No scheduled trips" hint="Nothing is scheduled for this direction today." />
        )}
      </Section>
    </>
  );
}
