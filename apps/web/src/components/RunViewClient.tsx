"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RunMap } from "./RunMap";
import { Section } from "./Section";

type UpcomingStop = {
  stop_id: string;
  name: string;
  scheduled: string;
  predicted?: string;
  platform?: string;
  delayMin?: number;
};

type RunData = {
  vehicle: {
    id: string;
    label: string;
    lat: number;
    lon: number;
    bearing?: number | null;
    speed?: number | null;
    occupancy?: string;
    delayMin: number | null;
  };
  trip: {
    trip_id: string;
    headsign: string | null;
    block_id?: string | null;
  } | null;
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

export function RunViewClient({
  feedId,
  vehicleId,
  initial,
}: {
  feedId: string;
  vehicleId: string;
  initial: RunData;
}) {
  const [data, setData] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${feedId}/${encodeURIComponent(vehicleId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        setData(await res.json());
        setUpdatedAt(new Date());
      }
    } catch {
      /* keep last good snapshot */
    }
  }, [feedId, vehicleId]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  const { vehicle, trip, route, currentStop, upcomingStops, shape, blockTrips } = data;
  const early = vehicle.delayMin != null && vehicle.delayMin < 0;
  const late = vehicle.delayMin != null && vehicle.delayMin > 0;

  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-go-bg border-b border-go-bg sm:grid-cols-4">
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
        <div className="p-5">
          <div className="go-section-title mb-1">Current stop</div>
          <div className="text-lg font-bold text-go-navy">{currentStop?.name ?? "—"}</div>
        </div>
        <div className="p-5">
          <div className="go-section-title mb-1">Status</div>
          <div className="text-sm font-semibold text-go-navy">
            {vehicle.occupancy ?? "—"}
          </div>
          {vehicle.speed != null && (
            <div className="mt-0.5 text-xs text-go-slate">
              {Math.round(vehicle.speed * 3.6)} km/h
            </div>
          )}
        </div>
      </div>

      <RunMap
        lat={vehicle.lat}
        lon={vehicle.lon}
        bearing={vehicle.bearing}
        shape={shape}
      />

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
                  {t.headsign ?? "Headsign unavailable"}
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

      {upcomingStops?.length > 0 ? (
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
                  <span className="go-badge go-badge--late shrink-0">+{s.delayMin} min</span>
                )}
                {s.delayMin != null && s.delayMin < 0 && (
                  <span className="go-badge go-badge--early shrink-0">{s.delayMin} min</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <div className="border-b border-go-bg px-5 py-6 text-center text-sm text-go-slate">
          No upcoming stop times available for this vehicle.
        </div>
      )}

      {trip && (
        <div className="border-t border-go-bg px-5 py-3 text-xs text-go-slate">
          Trip {trip.trip_id}
          {trip.block_id ? ` · Block ${trip.block_id}` : ""}
          {updatedAt && (
            <span className="float-right tabular-nums">
              Updated {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
      )}
    </>
  );
}
