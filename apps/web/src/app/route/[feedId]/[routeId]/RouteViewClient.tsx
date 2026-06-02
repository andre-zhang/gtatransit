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
  trips,
  vehicles,
}: {
  feedId: string;
  routeId: string;
  direction: number;
  trips: Trip[];
  vehicles: Vehicle[];
}) {
  const router = useRouter();

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
            className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition ${
              direction === d
                ? "bg-go-surface text-go-green shadow-sm"
                : "text-go-slate hover:text-go-navy"
            }`}
          >
            Direction {d}
          </button>
        ))}
      </div>

      {vehicles.length > 0 && (
        <Section title="Live">
          <ul className="divide-y divide-go-bg">
            {vehicles.map((v) => {
              const late = v.delay_sec != null && v.delay_sec > 0;
              return (
                <li key={v.vehicle_id}>
                  <Link
                    href={`/run/${feedId}/${encodeURIComponent(v.vehicle_id)}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-go-bg/60"
                  >
                    <span className="font-bold text-go-green">
                      {v.label ?? v.vehicle_id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-go-slate">{v.headsign}</span>
                    {late ? (
                      <span className="go-badge go-badge--late">
                        +{Math.round(v.delay_sec! / 60)}m
                      </span>
                    ) : (
                      <span className="go-badge go-badge--ontime">Live</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Schedule">
        <ul className="max-h-[28rem] divide-y divide-go-bg overflow-y-auto">
          {trips.map((t) => (
            <li
              key={t.trip_id}
              className="flex items-center justify-between gap-4 px-5 py-3"
            >
              <span className="truncate text-go-navy">{t.headsign ?? "—"}</span>
              <span className="shrink-0 text-lg font-bold tabular-nums text-go-navy">
                {t.first_departure}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
