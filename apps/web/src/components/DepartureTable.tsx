"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { cleanHeadsign } from "@/lib/headsign";
import { formatDelayLabel } from "@/lib/delay-label";
import { AgencyMark } from "./AgencyMark";
import { LiveIcon } from "./LiveIcon";
import { PageEmpty } from "./PageEmpty";
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
    return {
      prevDay,
      dayOffset,
      showDayBreak,
      dayLabel,
      displayTime,
      late,
      early,
      rowKey,
      isOpen,
      tripHref,
    };
  };

  return (
    <>
      <div className="md:hidden">
        <ul className="divide-y divide-go-bg">
          {rows.map((r, i) => {
            const m = renderRowMeta(r, i);
            return (
              <li key={m.rowKey}>
                {m.showDayBreak && m.dayLabel && (
                  <div className="departure-board-daybreak px-4 py-2 text-xs font-semibold uppercase tracking-wide text-go-slate">
                    {m.dayLabel}
                  </div>
                )}
                <button
                  type="button"
                  className={`departure-board-card w-full px-3 py-2.5 text-left ${m.isOpen ? "departure-board-row--open" : ""}`}
                  onClick={() => toggle(m.rowKey)}
                  aria-expanded={m.isOpen}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex w-[3.75rem] shrink-0 items-center justify-end gap-1">
                      {r.realtime && (
                        <LiveIcon className="h-3 w-3 shrink-0 text-go-green" title="Live" />
                      )}
                      <span
                        className={`departure-board-time departure-board-time--mobile tabular-nums leading-none ${
                          r.realtime
                            ? "departure-board-time--live"
                            : "departure-board-time--sched"
                        }`}
                      >
                        {m.displayTime}
                      </span>
                    </div>
                    {showAgency && <AgencyMark feedId={r.feedId} />}
                    <RoutePill
                      shortName={r.routeShort}
                      color={r.routeColor}
                      href={`/route/${r.feedId}/${encodeURIComponent(r.routeId)}`}
                    />
                    <Link
                      href={m.tripHref}
                      onClick={(e) => e.stopPropagation()}
                      className={`departure-board-dest min-w-0 flex-1 truncate text-sm ${
                        r.realtime ? "departure-board-dest--live" : "departure-board-dest--sched"
                      }`}
                    >
                      {cleanHeadsign(r.destination)}
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {m.late || m.early ? (
                        <span
                          className={`go-badge whitespace-nowrap ${m.late ? "go-badge--late" : "go-badge--early"}`}
                        >
                          {formatDelayLabel(r.latenessMin)}
                        </span>
                      ) : r.realtime && r.latenessMin === 0 ? (
                        <span className="go-badge go-badge--ontime whitespace-nowrap">On time</span>
                      ) : !r.realtime ? (
                        <span className="go-badge go-badge--sched whitespace-nowrap">Scheduled</span>
                      ) : null}
                      {r.vehicleId && (
                        <Link
                          href={`/run/${r.feedId}/${encodeURIComponent(r.vehicleId)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="go-link go-link--muted"
                        >
                          Vehicle
                        </Link>
                      )}
                      <Link
                        href={m.tripHref}
                        onClick={(e) => e.stopPropagation()}
                        className="go-link"
                      >
                        Trip
                      </Link>
                    </div>
                  </div>
                  {r.predicted && r.predicted !== r.time && (
                    <div className="mt-0.5 pl-[4rem] text-[10px] tabular-nums text-go-slate line-through">
                      {r.time}
                    </div>
                  )}
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
      </div>

      <div className="hidden overflow-x-auto md:block">
      <table className="departure-board-table w-full min-w-[36rem] text-left">
        <thead>
          <tr className="departure-board-head">
            <th className="px-5 py-3 text-right">Time</th>
            {showAgency && <th className="px-2 py-3">Agency</th>}
            <th className="px-3 py-3">Route</th>
            <th className="px-3 py-3">Headsign</th>
            <th className="px-5 py-3 text-right">Status</th>
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
                      className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-go-slate"
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
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.realtime && (
                        <LiveIcon className="h-3.5 w-3.5 shrink-0 text-go-green" title="Live" />
                      )}
                      <span
                        className={`departure-board-time tabular-nums leading-none ${
                          r.realtime ? "departure-board-time--live" : "departure-board-time--sched"
                        }`}
                      >
                        {m.displayTime}
                        {m.dayOffset > 0 && (
                          <sup className="ml-0.5 text-[10px] font-semibold text-go-slate">
                            +{m.dayOffset}
                          </sup>
                        )}
                      </span>
                    </div>
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
                    <RoutePill
                      shortName={r.routeShort}
                      color={r.routeColor}
                      size="lg"
                      href={`/route/${r.feedId}/${encodeURIComponent(r.routeId)}`}
                    />
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-3">
                    <Link
                      href={m.tripHref}
                      onClick={(e) => e.stopPropagation()}
                      className={`departure-board-dest truncate ${
                        r.realtime ? "departure-board-dest--live" : "departure-board-dest--sched"
                      }`}
                    >
                      {cleanHeadsign(r.destination)}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {m.late || m.early ? (
                        <span
                          className={`go-badge ${m.late ? "go-badge--late" : "go-badge--early"}`}
                        >
                          {formatDelayLabel(r.latenessMin)}
                        </span>
                      ) : r.realtime && r.latenessMin === 0 ? (
                        <span className="go-badge go-badge--ontime">On time</span>
                      ) : !r.realtime ? (
                        <span className="go-badge go-badge--sched">Scheduled</span>
                      ) : null}
                      {r.vehicleId && (
                        <Link
                          href={`/run/${r.feedId}/${encodeURIComponent(r.vehicleId)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="go-link go-link--muted"
                        >
                          Vehicle
                        </Link>
                      )}
                      <Link
                        href={m.tripHref}
                        onClick={(e) => e.stopPropagation()}
                        className="go-link"
                      >
                        Trip
                      </Link>
                    </div>
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
