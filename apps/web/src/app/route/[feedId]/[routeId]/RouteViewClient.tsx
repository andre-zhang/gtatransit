"use client";

import { useCallback, useEffect, useState } from "react";
import { DepartureActions, DepartureStatus } from "@/components/DepartureStatus";
import { PageEmpty } from "@/components/PageEmpty";
import { Section } from "@/components/Section";
import { TripLink } from "@/components/TripLink";
import { VehicleLink } from "@/components/VehicleLink";
import { tripPageHref } from "@/lib/detail-href";

type Trip = { trip_id: string; headsign: string | null; first_departure: string };
type Vehicle = {
  vehicle_id: string;
  label: string | null;
  headsign: string | null;
  delay_sec: number | null;
};

type RouteDetail = {
  trips: Trip[];
  vehicles: Vehicle[];
  directionLabels?: [string, string];
};

export function RouteViewClient({
  feedId,
  routeId,
  direction: initialDirection,
  directionLabels: initialLabels,
  trips: initialTrips,
  vehicles: initialVehicles,
}: {
  feedId: string;
  routeId: string;
  direction: number;
  directionLabels?: [string, string];
  trips: Trip[];
  vehicles: Vehicle[];
}) {
  const [direction, setDirection] = useState(initialDirection);
  const [labels, setLabels] = useState<[string, string]>(
    initialLabels ?? ["Outbound", "Inbound"],
  );
  const [trips, setTrips] = useState(initialTrips);
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [switching, setSwitching] = useState(false);

  const refreshLive = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/routes/${feedId}/${encodeURIComponent(routeId)}?direction=${direction}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as RouteDetail;
      setTrips(Array.isArray(data.trips) ? data.trips : []);
      setVehicles(Array.isArray(data.vehicles) ? data.vehicles : []);
      if (data.directionLabels) setLabels(data.directionLabels);
    } catch {
      /* keep last snapshot */
    }
  }, [direction, feedId, routeId]);

  useEffect(() => {
    void refreshLive();
    const id = setInterval(() => void refreshLive(), 20_000);
    return () => clearInterval(id);
  }, [refreshLive]);

  useEffect(() => {
    setDirection(initialDirection);
    setTrips(initialTrips);
    setVehicles(initialVehicles);
    if (initialLabels) setLabels(initialLabels);
  }, [initialDirection, initialTrips, initialVehicles, initialLabels]);

  const switchDirection = useCallback(
    async (d: number) => {
      if (d === direction) return;
      setDirection(d);
      setSwitching(true);
      try {
        const res = await fetch(
          `/api/routes/${feedId}/${encodeURIComponent(routeId)}?direction=${d}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as RouteDetail;
        setTrips(Array.isArray(data.trips) ? data.trips : []);
        setVehicles(Array.isArray(data.vehicles) ? data.vehicles : []);
        if (data.directionLabels) setLabels(data.directionLabels);
        const href = `/route/${feedId}/${encodeURIComponent(routeId)}?direction=${d}`;
        window.history.replaceState(null, "", href);
      } finally {
        setSwitching(false);
      }
    },
    [direction, feedId, routeId],
  );

  return (
    <>
      <div className="flex border-b border-go-bg bg-go-bg/50 p-1">
        {[0, 1].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => void switchDirection(d)}
            disabled={switching}
            className={`flex-1 rounded-sm px-2 py-2.5 text-sm font-bold transition ${
              direction === d
                ? "bg-go-surface text-go-green shadow-sm"
                : "text-go-slate hover:text-go-navy"
            } ${switching ? "opacity-80" : ""}`}
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
                v.delay_sec != null ? Math.round(v.delay_sec / 60) : undefined;
              return (
                <li
                  key={v.vehicle_id}
                  className="flex items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3"
                >
                  <span className="w-16 shrink-0 sm:w-20">
                    <VehicleLink
                      feedId={feedId}
                      vehicleId={v.vehicle_id}
                      label={v.label}
                      className="font-bold text-go-navy hover:text-go-green"
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-go-navy">
                    {v.headsign ?? "Headsign unavailable"}
                  </span>
                  <DepartureStatus realtime latenessMin={delayMin} />
                  <DepartureActions
                    vehicleHref={`/run/${feedId}/${encodeURIComponent(v.vehicle_id)}`}
                  />
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
                <TripLink
                  feedId={feedId}
                  tripId={t.trip_id}
                  className="w-16 shrink-0 text-right text-lg font-bold tabular-nums text-go-navy hover:text-go-green sm:w-20"
                >
                  {t.first_departure}
                </TripLink>
                <TripLink
                  feedId={feedId}
                  tripId={t.trip_id}
                  className="min-w-0 flex-1 truncate text-sm text-go-navy hover:text-go-green"
                >
                  {t.headsign ?? "Headsign unavailable"}
                </TripLink>
                <DepartureActions tripHref={tripPageHref(feedId, t.trip_id)} />
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
