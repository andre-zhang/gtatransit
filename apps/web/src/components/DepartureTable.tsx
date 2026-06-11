"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AgencyMark } from "./AgencyMark";
import { RoutePill } from "./RoutePill";

export type DepartureRow = {
  time: string;
  predicted?: string;
  routeShort: string;
  routeColor: string;
  destination: string;
  feedId: string;
  routeId: string;
  tripId: string;
  scheduleTripId?: string;
  stopId?: string;
  vehicleId?: string;
  platform?: string;
  delayMin?: number;
  latenessMin?: number;
  realtime: boolean;
  dayOffset?: number;
};

type TripStop = {
  stopId: string;
  name: string;
  scheduled: string;
  predicted?: string;
  platform?: string;
  delayMin?: number;
};

function TripStopsPanel({
  feedId,
  tripId,
  scheduleTripId,
  fromStop,
}: {
  feedId: string;
  tripId: string;
  scheduleTripId?: string;
  fromStop?: string;
}) {
  const [stops, setStops] = useState<TripStop[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (fromStop) params.set("fromStop", fromStop);
      if (scheduleTripId && scheduleTripId !== tripId) {
        params.set("scheduleTrip", scheduleTripId);
      }
      const qs = params.toString() ? `?${params}` : "";
      const res = await fetch(
        `/api/trips/${feedId}/${encodeURIComponent(tripId)}${qs}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { stops: TripStop[] };
      setStops(data.stops);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [feedId, tripId, scheduleTripId, fromStop]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="departure-board-expand px-5 py-3 text-sm text-go-slate">
        Loading upcoming stops…
      </div>
    );
  }
  if (error || !stops?.length) {
    return (
      <div className="departure-board-expand px-5 py-3 text-sm text-go-slate">
        {error ? "Could not load trip detail." : "No upcoming stops for this trip."}
      </div>
    );
  }

  return (
    <ul className="departure-board-expand divide-y divide-go-bg bg-go-bg/30">
      {stops.map((s, i) => (
        <li key={`${s.stopId}-${i}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
          <span className="w-14 shrink-0 text-right font-bold tabular-nums text-go-navy">
            {s.predicted ?? s.scheduled}
          </span>
          <span className="min-w-0 flex-1 truncate text-go-navy">{s.name}</span>
          {s.platform && (
            <span className="shrink-0 tabular-nums text-go-slate">Plat {s.platform}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function DepartureTable({
  rows,
  stopName,
}: {
  rows: DepartureRow[];
  stopName?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const showPlatform = stopName?.includes("GO") || stopName?.includes("Union") || rows.some((r) => r.feedId === "go");
  const showAgency = new Set(rows.map((r) => r.feedId)).size > 1;
  const liveCount = rows.filter((r) => r.realtime).length;

  if (!rows.length) {
    return (
      <div className="departure-board-empty">
        <p className="departure-board-emptyTitle">No upcoming departures</p>
        <p className="departure-board-emptyHint">Check back later or try another stop.</p>
      </div>
    );
  }

  const toggle = (key: string) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <div className="overflow-x-auto">
      {liveCount > 0 && (
        <div className="border-b border-[#e5e5e5] bg-[#fafafa] px-5 py-2 text-xs font-medium text-go-navy">
          {liveCount} live · {rows.length - liveCount} scheduled
        </div>
      )}
      <table className="departure-board-table w-full min-w-[28rem] text-left sm:min-w-[36rem]">
        <thead>
          <tr className="departure-board-head">
            <th className="px-5 py-3 text-right">Time</th>
            {showAgency && <th className="px-2 py-3">Agency</th>}
            <th className="px-3 py-3">Route</th>
            <th className="px-3 py-3">Headsign</th>
            {showPlatform && <th className="px-3 py-3 text-center">Plat</th>}
            <th className="px-5 py-3 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="departure-board-body">
          {rows.map((r, i) => {
            const prevDay = i > 0 ? rows[i - 1]!.dayOffset ?? 0 : 0;
            const dayOffset = r.dayOffset ?? 0;
            const showDayBreak = dayOffset > prevDay;
            const dayLabel =
              dayOffset === 1 ? "Tomorrow" : dayOffset > 1 ? `+${dayOffset} days` : null;
            const displayTime = r.predicted ?? r.time;
            const late = r.latenessMin != null && r.latenessMin > 0;
            const early = r.latenessMin != null && r.latenessMin < 0;
            const rowKey = `${r.tripId}-${i}`;
            const isOpen = expanded === rowKey;
            const tripParams = new URLSearchParams();
            if (r.stopId) tripParams.set("fromStop", r.stopId);
            if (r.scheduleTripId && r.scheduleTripId !== r.tripId) {
              tripParams.set("scheduleTrip", r.scheduleTripId);
            }
            const tripQs = tripParams.toString() ? `?${tripParams}` : "";
            const tripHref = `/trip/${r.feedId}/${encodeURIComponent(r.tripId)}${tripQs}`;

            return (
              <Fragment key={rowKey}>
                {showDayBreak && dayLabel && (
                  <tr className="departure-board-daybreak">
                    <td
                      colSpan={showAgency ? (showPlatform ? 6 : 5) : showPlatform ? 5 : 4}
                      className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-go-slate"
                    >
                      {dayLabel}
                    </td>
                  </tr>
                )}
                <tr
                  className={`departure-board-row cursor-pointer ${isOpen ? "departure-board-row--open" : ""}`}
                  onClick={() => toggle(rowKey)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(rowKey);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={isOpen}
                >
                  <td className="px-5 py-3 text-right">
                    <span
                      className={`departure-board-time tabular-nums leading-none ${
                        r.realtime ? "departure-board-time--live" : "departure-board-time--sched"
                      }`}
                    >
                      {displayTime}
                      {dayOffset > 0 && (
                        <sup className="ml-0.5 text-[10px] font-semibold text-go-slate">
                          +{dayOffset}
                        </sup>
                      )}
                    </span>
                    {r.predicted && r.predicted !== r.time && (
                      <span className="departure-board-timeWas mt-0.5 block tabular-nums line-through">
                        {r.time}
                      </span>
                    )}
                  </td>
                  {showAgency && (
                    <td className="px-2 py-3">
                      <AgencyMark feedId={r.feedId} />
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <RoutePill shortName={r.routeShort} color={r.routeColor} size="lg" />
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-3">
                    <span
                      className={`departure-board-dest truncate ${
                        r.realtime ? "departure-board-dest--live" : "departure-board-dest--sched"
                      }`}
                    >
                      {r.destination}
                    </span>
                  </td>
                  {showPlatform && (
                    <td className="departure-board-plat px-3 py-3 text-center tabular-nums">
                      {r.feedId === "go" ? (r.platform ?? "—") : ""}
                    </td>
                  )}
                  <td className="px-5 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {late ? (
                        <span className="go-badge go-badge--late">+{r.latenessMin} min</span>
                      ) : early ? (
                        <span className="go-badge go-badge--early">{r.latenessMin} min</span>
                      ) : r.realtime && r.latenessMin === 0 ? (
                        <span className="go-badge go-badge--ontime">On time</span>
                      ) : r.realtime && r.predicted && r.predicted !== r.time ? (
                        <span className="go-badge go-badge--live">Live</span>
                      ) : r.realtime ? (
                        <span className="go-badge go-badge--live">Live</span>
                      ) : (
                        <span className="go-badge go-badge--sched">Scheduled</span>
                      )}
                      {r.vehicleId && (
                        <Link
                          href={`/run/${r.feedId}/${encodeURIComponent(r.vehicleId)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs font-semibold text-go-slate hover:text-go-navy hover:underline"
                        >
                          Vehicle
                        </Link>
                      )}
                      <Link
                        href={tripHref}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-semibold text-go-green hover:underline"
                      >
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={(showPlatform ? 1 : 0) + (showAgency ? 1 : 0) + 4} className="p-0">
                      <TripStopsPanel
                        feedId={r.feedId}
                        tripId={r.tripId}
                        scheduleTripId={r.scheduleTripId}
                        fromStop={r.stopId}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
