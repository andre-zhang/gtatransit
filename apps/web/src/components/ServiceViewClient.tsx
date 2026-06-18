"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ServiceViewData } from "@/lib/demo-service-view";
import { formatDelayLabel, isPlausibleDelayMin } from "@/lib/delay-label";
import { isMetrolinxRailFeed, goLineCode } from "@/lib/go-rail";
import { cleanHeadsign } from "@/lib/headsign";
import { LiveIcon } from "./LiveIcon";
import { PageEmpty } from "./PageEmpty";
import { Section } from "./Section";
import { StopTimeline } from "./StopTimeline";
import { VehicleLink } from "./VehicleLink";

const RunMap = dynamic(
  () => import("./RunMap").then((m) => ({ default: m.RunMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-44 items-center justify-center border-b border-go-bg bg-go-bg/30 text-sm text-go-slate sm:h-56">
        Loading map…
      </div>
    ),
  },
);

function blockTimeRange(start?: string | null, end?: string | null) {
  if (!start) return null;
  if (end && end !== start) return `${start} – ${end}`;
  return start;
}

function blockTripTimes(first: string, last?: string) {
  if (!last || last === first) return first;
  return `${first} – ${last}`;
}

function blockSectionTitle(trip: ServiceViewData["trip"]) {
  if (trip?.block_id) return `Block ${trip.block_id}`;
  return "Trips in block";
}

export function ServiceViewClient({
  feedId,
  vehicleId,
  tripId,
  tripQuery,
  initial,
}: {
  feedId: string;
  vehicleId?: string;
  tripId?: string;
  tripQuery?: { fromStop?: string; scheduleTrip?: string };
  initial: ServiceViewData | null;
}) {
  const [data, setData] = useState<ServiceViewData | null>(initial);
  const [loading, setLoading] = useState(initial == null);
  const [coachesOpen, setCoachesOpen] = useState(false);
  const hadDataRef = useRef(initial != null);
  const apiPath = vehicleId
    ? `/api/runs/${feedId}/${encodeURIComponent(vehicleId)}`
    : tripId
      ? (() => {
          const params = new URLSearchParams({ view: "service" });
          if (tripQuery?.fromStop) params.set("fromStop", tripQuery.fromStop);
          if (tripQuery?.scheduleTrip && tripQuery.scheduleTrip !== tripId) {
            params.set("scheduleTrip", tripQuery.scheduleTrip);
          }
          return `/api/trips/${feedId}/${encodeURIComponent(tripId)}?${params}`;
        })()
      : null;

  const refresh = useCallback(async () => {
    if (!apiPath) return;
    if (!hadDataRef.current) setLoading(true);
    try {
      const res = await fetch(apiPath, { cache: "no-store" });
      if (res.ok) {
        setData((await res.json()) as ServiceViewData);
        hadDataRef.current = true;
      } else if (!hadDataRef.current) {
        setData(null);
      }
    } catch {
      /* keep last snapshot */
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), 20_000);
    if (!hadDataRef.current) void refresh();
    return () => clearInterval(id);
  }, [refresh]);

  if (!data) {
    return (
      <PageEmpty
        title={loading ? "Loading…" : vehicleId ? "Vehicle not found" : "Trip not found"}
        hint={
          loading
            ? undefined
            : vehicleId
              ? "This vehicle is no longer reporting location."
              : "It may have ended or is not in today's schedule."
        }
      />
    );
  }

  const { vehicle, trip, route, currentStop, tripStops, shape, trainDetail } = data;
  const blockTrips = data.blockTrips;
  const blockRange = blockTimeRange(data.blockStart, data.blockEnd);
  const delayMin = vehicle?.delayMin ?? null;
  const early = isPlausibleDelayMin(delayMin) && delayMin! < 0;
  const late = isPlausibleDelayMin(delayMin) && delayMin! > 0;
  const delayLabel = formatDelayLabel(isPlausibleDelayMin(delayMin) ? delayMin : null);
  const lineCode =
    goLineCode(route?.short_name) ??
    goLineCode(trip?.headsign ?? undefined) ??
    route?.short_name ??
    null;
  const isGoTrain = isMetrolinxRailFeed(feedId, lineCode);
  const coachCount = trainDetail?.cars ?? trainDetail?.coachNumbers.length ?? null;
  const coachLabel =
    trainDetail?.carsLabel ??
    (coachCount != null ? `${coachCount} coach${coachCount === 1 ? "" : "es"}` : null);

  const vehicleLabel =
    vehicle?.label?.trim() && vehicle.label.trim() !== vehicle.id
      ? vehicle.label.trim()
      : vehicle?.id;

  const showMap = vehicle?.lat != null && vehicle.lon != null;

  return (
    <>
      {loading && (
        <div className="border-b border-go-bg px-5 py-2 text-xs text-go-slate">Updating…</div>
      )}
      <div className="grid grid-cols-2 divide-x divide-go-bg border-b border-go-bg sm:grid-cols-4">
        <div className="p-5">
          <div className="go-section-title mb-1">Delay</div>
          <div
            className={`text-2xl font-bold ${
              late ? "text-go-late" : early ? "text-go-slate" : "text-go-ontime"
            }`}
          >
            {delayLabel ?? "On time"}
          </div>
        </div>
        <div className="p-5">
          <div className="go-section-title mb-1">{vehicle ? "Vehicle" : "Trip"}</div>
          <div className="text-lg font-bold text-go-navy">
            {vehicle && vehicleLabel ? (
              <VehicleLink feedId={feedId} vehicleId={vehicle.id} label={vehicleLabel} />
            ) : (
              trip?.trip_id ?? "—"
            )}
          </div>
        </div>
        <div className="p-5">
          <div className="go-section-title mb-1">Current stop</div>
          {currentStop?.groupId ? (
            <Link
              href={`/stop/${currentStop.groupId}`}
              className="text-lg font-bold text-go-navy hover:text-go-green"
            >
              {currentStop.name}
            </Link>
          ) : (
            <div className="text-lg font-bold text-go-navy">{currentStop?.name ?? "—"}</div>
          )}
        </div>
        <div className="p-5">
          <div className="go-section-title mb-1">{isGoTrain ? "Coaches" : "Status"}</div>
          {isGoTrain ? (
            <>
              <button
                type="button"
                className="text-left text-lg font-bold text-go-navy hover:text-go-green"
                onClick={() => setCoachesOpen((v) => !v)}
                aria-expanded={coachesOpen}
              >
                {coachLabel ?? "—"}
                {(trainDetail?.coachNumbers.length || trainDetail?.display) && (
                  <span className="ml-1 text-xs font-normal text-go-slate">
                    {coachesOpen ? "▲" : "▼"}
                  </span>
                )}
              </button>
              {trainDetail?.occupancyPercent != null && (
                <div className="mt-0.5 text-xs text-go-slate">
                  {trainDetail.occupancyPercent}% full
                </div>
              )}
              {coachesOpen && (
                <div className="mt-2 space-y-1 text-xs text-go-slate">
                  {trainDetail?.coachNumbers.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {trainDetail.coachNumbers.map((c) => (
                        <li
                          key={c}
                          className="rounded border border-go-bg bg-white px-2 py-0.5 font-mono text-go-navy"
                        >
                          {c}
                        </li>
                      ))}
                    </ul>
                  ) : trainDetail?.display ? (
                    <p>{trainDetail.display}</p>
                  ) : (
                    <p>Coach numbers not available</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-go-navy">
                {vehicle?.occupancy ?? "—"}
              </div>
              {vehicle?.speed != null && (
                <div className="mt-0.5 text-xs text-go-slate">
                  {Math.round(vehicle.speed * 3.6)} km/h
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showMap && (
        <RunMap
          lat={vehicle!.lat}
          lon={vehicle!.lon}
          bearing={vehicle!.bearing}
          shape={shape}
          routeColor={route?.color}
        />
      )}

      {tripStops.length > 0 ? (
        <Section title="Stops">
          <StopTimeline stops={tripStops} />
        </Section>
      ) : (
        <PageEmpty title="No stops" />
      )}

      {blockTrips.length > 0 && (
        <Section title={blockSectionTitle(trip)} subtitle={blockRange ?? undefined}>
          <ul className="divide-y divide-go-bg">
            {blockTrips.map((t) => (
              <li
                key={t.trip_id}
                className={`relative flex items-start gap-2 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3 ${t.active ? "bg-go-bg/40" : ""}`}
              >
                <span
                  className={`mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 ${
                    t.active ? "border-go-green bg-go-green" : "border-go-slate bg-white"
                  }`}
                />
                <span className="w-24 shrink-0 text-sm font-bold tabular-nums text-go-navy sm:w-28">
                  {blockTripTimes(t.first_departure, t.last_departure)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-go-navy">
                  {cleanHeadsign(t.headsign) || "—"}
                </span>
                {t.active && (
                  <span className="go-badge go-badge--live inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                    <LiveIcon className="h-3 w-3" title="Active" />
                    <span className="hidden sm:inline">Active</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
