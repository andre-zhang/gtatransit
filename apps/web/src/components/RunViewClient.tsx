"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDelayLabel } from "@/lib/delay-label";
import { isGoRailLine } from "@/lib/go-rail";
import { cleanHeadsign } from "@/lib/headsign";
import { LiveIcon } from "./LiveIcon";
import { RunMap } from "./RunMap";
import { Section } from "./Section";
import { StopTimeline } from "./StopTimeline";

type UpcomingStop = {
  stop_id: string;
  name: string;
  scheduled: string;
  predicted?: string;
  platform?: string;
  delayMin?: number;
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
  currentStop: { stop_id: string; name: string } | null;
  upcomingStops: UpcomingStop[];
  blockStart?: string | null;
  blockEnd?: string | null;
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

function blockSectionSubtitle(blockStart?: string | null, blockEnd?: string | null) {
  if (!blockStart) return undefined;
  if (blockEnd && blockEnd !== blockStart) return `${blockStart} – ${blockEnd}`;
  return blockStart;
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [trainDetail, setTrainDetail] = useState<GoTrainDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/runs/${feedId}/${encodeURIComponent(vehicleId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      /* keep last good snapshot */
    } finally {
      setLoading(false);
    }
  }, [feedId, vehicleId]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!detailsOpen || feedId !== "go" || !data?.trip?.trip_id) return;
    let cancelled = false;
    setDetailLoading(true);
    void fetch(
      `/api/go/train-detail?tripId=${encodeURIComponent(data.trip.trip_id)}`,
      { cache: "no-store" },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setTrainDetail(json as GoTrainDetail | null);
      })
      .catch(() => {
        if (!cancelled) setTrainDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailsOpen, feedId, data?.trip?.trip_id]);

  if (!data) {
    return (
      <div className="px-6 py-12 text-center text-sm text-go-slate">
        {loading
          ? "Loading vehicle…"
          : "Vehicle not found or no longer reporting location."}
      </div>
    );
  }

  const { vehicle, trip, route, currentStop, upcomingStops, shape, blockTrips, blockStart, blockEnd } =
    data;
  const early = vehicle.delayMin != null && vehicle.delayMin < 0;
  const late = vehicle.delayMin != null && vehicle.delayMin > 0;
  const delayLabel = formatDelayLabel(vehicle.delayMin);
  const showGoTrainDetails = feedId === "go" && isGoRailLine(route?.short_name);

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
          <div className="text-lg font-bold text-go-navy">#{vehicle.id}</div>
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

      {showGoTrainDetails && (
        <div className="border-b border-go-bg">
          <button
            type="button"
            className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold text-go-navy hover:bg-go-bg/30"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
          >
            <span>Train details</span>
            <span className="text-go-slate">{detailsOpen ? "−" : "+"}</span>
          </button>
          {detailsOpen && (
            <div className="border-t border-go-bg px-5 py-4 text-sm text-go-navy">
              {detailLoading ? (
                <p className="text-go-slate">Loading consist…</p>
              ) : trainDetail?.carsLabel ? (
                <div className="space-y-1">
                  <p className="font-semibold">{trainDetail.carsLabel}</p>
                  {trainDetail.display ? (
                    <p className="text-go-slate">{trainDetail.display}</p>
                  ) : null}
                  {trainDetail.occupancyPercent != null ? (
                    <p className="text-go-slate">
                      {trainDetail.occupancyPercent}% full
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-go-slate">Consist information unavailable.</p>
              )}
            </div>
          )}
        </div>
      )}

      <RunMap
        lat={vehicle.lat}
        lon={vehicle.lon}
        bearing={vehicle.bearing}
        shape={shape}
      />

      {upcomingStops?.length > 0 ? (
        <Section title="Next stops">
          <StopTimeline stops={upcomingStops} />
        </Section>
      ) : (
        <div className="border-b border-go-bg px-5 py-6 text-center text-sm text-go-slate">
          No upcoming stop times available for this vehicle.
        </div>
      )}

      {blockTrips && blockTrips.length > 0 && (
        <Section
          title={blockSectionTitle(trip)}
          subtitle={blockSectionSubtitle(blockStart, blockEnd)}
        >
          <ul className="divide-y divide-go-bg">
            {blockTrips.map((t) => (
              <li
                key={t.trip_id}
                className={`flex items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3 ${t.active ? "bg-go-bg/40" : ""}`}
              >
                <span className="w-[4.5rem] shrink-0 text-right text-xs font-bold tabular-nums text-go-navy sm:w-28 sm:text-sm">
                  {t.last_departure
                    ? `${t.first_departure}–${t.last_departure}`
                    : t.first_departure}
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
                <Link
                  href={`/trip/${feedId}/${encodeURIComponent(t.trip_id)}`}
                  className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-go-green hover:underline sm:text-xs"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

    </>
  );
}
