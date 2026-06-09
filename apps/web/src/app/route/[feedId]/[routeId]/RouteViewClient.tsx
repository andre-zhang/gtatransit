"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
            className={`flex-1 rounded-lg px-2 py-2.5 text-sm font-bold transition ${
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
                <li key={v.vehicle_id}>
                  <Link
                    href={`/run/${feedId}/${encodeURIComponent(v.vehicle_id)}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-go-bg/60"
                  >
                    <span className="font-bold text-go-green">
                      {v.label ?? v.vehicle_id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-go-slate">
                      {v.headsign ?? "In service"}
                    </span>
                    {late ? (
                      <span className="go-badge go-badge--late">+{delayMin} min</span>
                    ) : early ? (
                      <span className="go-badge go-badge--early">{delayMin} min</span>
                    ) : (
                      <span className="go-badge go-badge--live">Live</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : (
        <div className="border-b border-go-bg px-5 py-4 text-sm text-go-slate">
          No vehicles reporting on this direction right now.
        </div>
      )}

      <Section title="Schedule">
        {trips.length > 0 ? (
          <ul className="max-h-[28rem] divide-y divide-go-bg overflow-y-auto">
            {trips.map((t) => (
              <li key={t.trip_id}>
                <Link
                  href={`/trip/${feedId}/${encodeURIComponent(t.trip_id)}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-go-bg/60"
                >
                  <span className="truncate text-go-navy">{t.headsign ?? "—"}</span>
                  <span className="shrink-0 text-lg font-bold tabular-nums text-go-navy">
                    {t.first_departure}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-go-slate">
            No scheduled trips for this direction today.
          </div>
        )}
      </Section>
    </>
  );
}
