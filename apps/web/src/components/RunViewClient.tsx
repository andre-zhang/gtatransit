"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDelayLabel, isPlausibleDelayMin } from "@/lib/delay-label";
import { tripPageHref } from "@/lib/detail-href";
import { isMetrolinxRailFeed, goLineCode } from "@/lib/go-rail";
import { cleanHeadsign } from "@/lib/headsign";
import { DepartureActions } from "./DepartureStatus";
import { LiveIcon } from "./LiveIcon";
import { PageEmpty } from "./PageEmpty";
import { RunMap } from "./RunMap";
import { Section } from "./Section";
import { StopTimeline } from "./StopTimeline";
import { TripLink } from "./TripLink";
import { VehicleLink } from "./VehicleLink";

type UpcomingStop = {
  stop_id: string;
  name: string;
  scheduled: string;
  predicted?: string;
  platform?: string;
  delayMin?: number;
  groupId?: string;
};

type GoTrainDetail = {
  cars: number | null;
  carsLabel: string | null;
  occupancyPercent: number | null;
  display: string | null;
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
  currentStop: { stop_id: string; name: string; groupId?: string } | null;
  upcomingStops: UpcomingStop[];
  blockStart?: string | null;
  blockEnd?: string | null;
  trainDetail?: GoTrainDetail | null;
  blockTrips?: Array<{
    trip_id: string;
    headsign: string | null;
    first_departure: string;
    last_departure?: string;
    active: boolean;
  }>;
  shape: GeoJSON.Feature | null;
};

function blockSectionTitle(trip: RunData["trip"]) {
  if (trip?.block_id) return `Block ${trip.block_id}`;
  return "Trips in block";
}

function blockTimeRange(start?: string | null, end?: string | null) {
  if (!start) return null;
  if (end && end !== start) return `${start} – ${end}`;
  return start;
}

function blockTripTime(t: { first_departure: string; last_departure?: string }) {
  return blockTimeRange(t.first_departure, t.last_departure) ?? t.first_departure;
}

export function RunViewClient({
  feedId,
  vehicleId,
  initial,
}: {
  feedId: string;
  vehicleId: string;
  initial: RunData | null;
}) {
  const [data, setData] = useState<RunData | null>(initial);
  const [loading, setLoading] = useState(initial == null);
  const [trainDetail, setTrainDetail] = useState<GoTrainDetail | null>(null);
  const hadDataRef = useRef(initial != null);

  const refresh = useCallback(async () => {
    if (!hadDataRef.current) setLoading(true);
    try {
      const res = await fetch(`/api/runs/${feedId}/${encodeURIComponent(vehicleId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const next = (await res.json()) as RunData;
        setData(next);
        hadDataRef.current = true;
      } else if (!hadDataRef.current) {
        setData(null);
      }
    } catch {
      /* keep last good snapshot */
    } finally {
      setLoading(false);
    }
  }, [feedId, vehicleId]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), 20_000);
    if (!hadDataRef.current) void refresh();
    return () => clearInterval(id);
  }, [refresh]);

  if (!data) {
    return (
      <PageEmpty
        title={loading ? "Loading vehicle…" : "Vehicle not found"}
        hint={
          loading
            ? undefined
            : "This vehicle is no longer reporting location."
        }
      />
    );
  }

  const {
    vehicle,
    trip,
    route,
    currentStop,
    upcomingStops,
    shape,
    blockTrips,
    blockStart,
    blockEnd,
  } = data;
  const early = isPlausibleDelayMin(vehicle.delayMin) && vehicle.delayMin! < 0;
  const late = isPlausibleDelayMin(vehicle.delayMin) && vehicle.delayMin! > 0;
  const delayLabel = formatDelayLabel(
    isPlausibleDelayMin(vehicle.delayMin) ? vehicle.delayMin : null,
  );
  const lineCode =
    goLineCode(route?.short_name) ??
    goLineCode(trip?.headsign ?? undefined) ??
    route?.short_name ??
    null;
  const isGoTrain = isMetrolinxRailFeed(feedId, lineCode);

  useEffect(() => {
    if (!isGoTrain || !trip?.trip_id) {
      setTrainDetail(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/go/train-detail?tripId=${encodeURIComponent(trip.trip_id)}`, {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((detail) => {
        if (!cancelled) setTrainDetail(detail as GoTrainDetail | null);
      })
      .catch(() => {
        if (!cancelled) setTrainDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isGoTrain, trip?.trip_id]);

  const vehicleLabel =
    vehicle.label?.trim() && vehicle.label.trim() !== vehicle.id
      ? vehicle.label.trim()
      : vehicle.id;
  const blockRange = blockTimeRange(blockStart, blockEnd);

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
          <div className="go-section-title mb-1">Vehicle</div>
          <div className="text-lg font-bold">
            <VehicleLink feedId={feedId} vehicleId={vehicle.id} label={vehicleLabel} />
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
          <div className="go-section-title mb-1">{isGoTrain ? "Consist" : "Status"}</div>
          {isGoTrain ? (
            <>
              <div className="text-lg font-bold text-go-navy">
                {trainDetail?.carsLabel ?? "—"}
              </div>
              {trainDetail?.occupancyPercent != null ? (
                <div className="mt-0.5 text-xs text-go-slate">
                  {trainDetail.occupancyPercent}% full
                </div>
              ) : vehicle.occupancy ? (
                <div className="mt-0.5 text-xs text-go-slate">{vehicle.occupancy}</div>
              ) : null}
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-go-navy">
                {vehicle.occupancy ?? "—"}
              </div>
              {vehicle.speed != null && (
                <div className="mt-0.5 text-xs text-go-slate">
                  {Math.round(vehicle.speed * 3.6)} km/h
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <RunMap
        lat={vehicle.lat}
        lon={vehicle.lon}
        bearing={vehicle.bearing}
        shape={shape}
        routeColor={route?.color}
      />

      {upcomingStops?.length > 0 ? (
        <Section title="Next stops">
          <StopTimeline stops={upcomingStops} />
        </Section>
      ) : (
        <PageEmpty title="No upcoming stops" />
      )}

      {blockTrips && blockTrips.length > 0 && (
        <Section title={blockSectionTitle(trip)} subtitle={blockRange ?? undefined}>
          <ul className="divide-y divide-go-bg">
            {blockTrips.map((t) => (
              <li
                key={t.trip_id}
                className={`flex items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3 ${t.active ? "bg-go-bg/40" : ""}`}
              >
                <TripLink
                  feedId={feedId}
                  tripId={t.trip_id}
                  className="w-[5.5rem] shrink-0 text-right text-xs font-bold tabular-nums text-go-navy hover:text-go-green sm:w-32 sm:text-sm"
                >
                  {blockTripTime(t)}
                </TripLink>
                <TripLink
                  feedId={feedId}
                  tripId={t.trip_id}
                  className="min-w-0 flex-1 truncate text-sm text-go-navy hover:text-go-green"
                >
                  {cleanHeadsign(t.headsign) || "—"}
                </TripLink>
                {t.active && (
                  <span className="go-badge go-badge--live inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                    <LiveIcon className="h-3 w-3" title="Active" />
                    <span className="hidden sm:inline">Active</span>
                  </span>
                )}
                <DepartureActions tripHref={tripPageHref(feedId, t.trip_id)} />
              </li>
            ))}
          </ul>
        </Section>
      )}

    </>
  );
}
