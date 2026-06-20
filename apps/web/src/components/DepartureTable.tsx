"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { cleanHeadsign } from "@/lib/headsign";
import { routePageHref, runPageHref, tripPageHref } from "@/lib/detail-href";
import { AgencyMark } from "./AgencyMark";
import { DepartureActionLinks, DepartureStatus } from "./DepartureStatus";
import { PageEmpty } from "./PageEmpty";
import { RoutePill } from "./RoutePill";
import { TimePair } from "./TimePair";

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
  groupId?: string;
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
      const qs = params.toString() ? `?${params}&lite=1` : "?lite=1";
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
      <div className="departure-board-expand px-3 py-2.5 text-sm text-go-slate sm:px-5 sm:py-3">
        Loading upcoming stops…
      </div>
    );
  }
  if (error || !stops?.length) {
    return (
      <div className="departure-board-expand px-3 py-2.5 text-sm text-go-slate sm:px-5 sm:py-3">
        {error ? "Could not load trip detail." : "No upcoming stops for this trip."}
      </div>
    );
  }

  return (
    <ul className="departure-board-expand divide-y divide-go-bg bg-go-bg/30">
      {stops.map((s, i) => (
        <li key={`${s.stopId}-${i}`} className="flex items-center gap-2 px-3 py-2.5 text-sm sm:gap-3 sm:px-5">
          <span className="w-12 shrink-0 sm:w-14">
            <TimePair
              scheduled={s.scheduled}
              predicted={s.predicted}
              size="sm"
            />
          </span>
          {s.groupId ? (
            <Link
              href={`/stop/${s.groupId}`}
              className="min-w-0 flex-1 truncate text-go-navy hover:text-go-green"
            >
              {s.name}
            </Link>
          ) : (
            <span className="min-w-0 flex-1 truncate text-go-navy">{s.name}</span>
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
  const showAgency = new Set(rows.map((r) => r.feedId)).size > 1;

  if (!rows.length) {
    return (
      <PageEmpty
        title="No upcoming departures"
        hint="Check back later or try another stop."
      />
    );
  }

  const toggle = (key: string) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  const renderRowMeta = (r: DepartureRow, i: number) => {
    const prevDay = i > 0 ? rows[i - 1]!.dayOffset ?? 0 : 0;
    const dayOffset = r.dayOffset ?? 0;
    const showDayBreak = dayOffset > prevDay;
    const dayLabel =
      dayOffset === 1 ? "Tomorrow" : dayOffset > 1 ? `+${dayOffset} days` : null;
    const predictedDisplay =
      r.realtime && r.predicted && r.predicted !== r.time ? r.predicted : undefined;
    const rowKey = `${r.tripId}-${i}`;
    const isOpen = expanded === rowKey;
    const tripHref = tripPageHref(r.feedId, r.tripId, {
      fromStop: r.stopId,
      scheduleTrip: r.scheduleTripId,
    });
    const vehicleHref =
      r.realtime && r.vehicleId
        ? runPageHref(r.feedId, r.vehicleId)
        : undefined;
    return {
      prevDay,
      dayOffset,
      showDayBreak,
      dayLabel,
      rowKey,
      isOpen,
      tripHref,
      vehicleHref,
      predictedDisplay,
    };
  };

  return (
    <>
      <ul className="departure-board-cards divide-y divide-go-bg">
          {rows.map((r, i) => {
            const m = renderRowMeta(r, i);
            return (
              <li key={m.rowKey}>
                {m.showDayBreak && m.dayLabel && (
                  <div className="departure-board-daybreak px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-go-slate">
                    {m.dayLabel}
                  </div>
                )}
                <button
                  type="button"
                  className={`departure-board-card w-full text-left ${m.isOpen ? "departure-board-row--open" : ""}`}
                  onClick={() => toggle(m.rowKey)}
                  aria-expanded={m.isOpen}
                >
                  <div className="departure-board-card-grid">
                    <div className="departure-board-card-time">
                      <DepartureStatus
                        realtime={r.realtime}
                        latenessMin={r.latenessMin}
                      />
                      <TimePair
                        scheduled={r.time}
                        predicted={m.predictedDisplay}
                        size="sm"
                        align="right"
                      />
                    </div>
                    <div className="departure-board-card-meta">
                      {showAgency && <AgencyMark feedId={r.feedId} />}
                      <RoutePill
                        shortName={r.routeShort}
                        color={r.routeColor}
                        size="sm"
                        href={routePageHref(r.feedId, r.routeId)}
                      />
                    </div>
                    <div className="departure-board-card-status">
                      <DepartureActionLinks
                        tripHref={m.tripHref}
                        vehicleHref={m.vehicleHref}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <Link
                      href={m.tripHref}
                      onClick={(e) => e.stopPropagation()}
                      className={`departure-board-card-dest departure-board-dest departure-board-dest--clamp ${
                        r.realtime ? "departure-board-dest--live" : "departure-board-dest--sched"
                      }`}
                    >
                      {cleanHeadsign(r.destination)}
                    </Link>
                  </div>
                </button>
                {m.isOpen && (
                  <TripStopsPanel
                    feedId={r.feedId}
                    tripId={r.tripId}
                    scheduleTripId={r.scheduleTripId}
                    fromStop={r.stopId}
                  />
                )}
              </li>
            );
          })}
        </ul>

      <div className="departure-board-table-wrap">
      <table className="departure-board-table departure-board-table--compact w-full">
        <thead>
          <tr className="departure-board-head">
            <th className="departure-board-time-cell text-right">Time</th>
            {showAgency && <th className="departure-board-agency-cell">Agency</th>}
            <th className="departure-board-route-cell">Route</th>
            <th className="departure-board-dest-cell">Headsign</th>
            <th className="departure-board-actions-cell text-right">
              <span className="sr-only">Links</span>
            </th>
          </tr>
        </thead>
        <tbody className="departure-board-body">
          {rows.map((r, i) => {
            const m = renderRowMeta(r, i);

            return (
              <Fragment key={m.rowKey}>
                {m.showDayBreak && m.dayLabel && (
                  <tr className="departure-board-daybreak">
                    <td
                      colSpan={showAgency ? 5 : 4}
                      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-go-slate"
                    >
                      {m.dayLabel}
                    </td>
                  </tr>
                )}
                <tr
                  className={`departure-board-row cursor-pointer ${m.isOpen ? "departure-board-row--open" : ""}`}
                  onClick={() => toggle(m.rowKey)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(m.rowKey);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={m.isOpen}
                >
                  <td className="departure-board-time-cell text-right">
                    <div className="departure-board-time-wrap">
                      <DepartureStatus
                        realtime={r.realtime}
                        latenessMin={r.latenessMin}
                      />
                      <TimePair
                        scheduled={r.time}
                        predicted={m.predictedDisplay}
                        size="sm"
                        align="right"
                      />
                      {m.dayOffset > 0 && (
                        <sup className="ml-0.5 text-[10px] font-semibold text-go-slate">
                          +{m.dayOffset}
                        </sup>
                      )}
                    </div>
                  </td>
                  {showAgency && (
                    <td className="departure-board-agency-cell">
                      <AgencyMark feedId={r.feedId} iconOnly />
                    </td>
                  )}
                  <td className="departure-board-route-cell">
                    <RoutePill
                      shortName={r.routeShort}
                      color={r.routeColor}
                      size="md"
                      href={routePageHref(r.feedId, r.routeId)}
                    />
                  </td>
                  <td className="departure-board-dest-cell">
                    <Link
                      href={m.tripHref}
                      onClick={(e) => e.stopPropagation()}
                      className={`departure-board-dest departure-board-dest--clamp ${
                        r.realtime ? "departure-board-dest--live" : "departure-board-dest--sched"
                      }`}
                    >
                      {cleanHeadsign(r.destination)}
                    </Link>
                  </td>
                  <td className="departure-board-actions-cell text-right">
                    <DepartureActionLinks
                      tripHref={m.tripHref}
                      vehicleHref={m.vehicleHref}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                </tr>
                {m.isOpen && (
                  <tr>
                    <td colSpan={(showAgency ? 1 : 0) + 4} className="p-0">
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
    </>
  );
}
