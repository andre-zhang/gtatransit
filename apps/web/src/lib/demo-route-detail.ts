import goSchedules from "../../demo/go-schedules.json";
import unionSchedule from "../../demo/union-schedule.json";
import { routeColor } from "./colors";
import { getDemoCore } from "./demo";
import type { ScheduleRow } from "./demo-schedules";
import { getRtVehicles } from "./rt-cache";
import { lookupTripFromSchedules } from "./demo-trip-lookup";

type RouteMeta = {
  short_name: string | null;
  long_name: string | null;
  route_type: number;
  color: string;
};

function formatDeparture(time: string): string {
  const parts = time.split(":");
  if (parts.length < 2) return time;
  const h = Number(parts[0]);
  const m = parts[1];
  if (Number.isNaN(h)) return time.slice(0, 5);
  return `${String(h % 24).padStart(2, "0")}:${m}`;
}

function findRouteMeta(feedId: string, routeId: string): RouteMeta | null {
  for (const agency of getDemoCore().filterTree.agencies) {
    if (agency.id !== feedId) continue;
    for (const mode of agency.modes) {
      const r = mode.routes.find(
        (x) => x.id === routeId || x.shortName === routeId,
      );
      if (r) {
        return {
          short_name: r.shortName,
          long_name: r.longName,
          route_type: mode.type,
          color: routeColor(feedId, r.shortName, null),
        };
      }
    }
  }

  const sample = (unionSchedule as ScheduleRow[]).find(
    (row) => row.feedId === feedId && row.routeId === routeId,
  );
  if (sample) {
    return {
      short_name: sample.routeShort,
      long_name: sample.headsign,
      route_type: feedId === "go" ? 2 : 3,
      color: sample.routeColor,
    };
  }

  return null;
}

function collectScheduleRows(feedId: string, routeId: string): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const row of unionSchedule as ScheduleRow[]) {
    if (
      row.feedId === feedId &&
      (row.routeId === routeId || row.routeShort === routeId)
    ) {
      rows.push(row);
    }
  }
  if (feedId === "go") {
    for (const sched of Object.values(goSchedules as Record<string, ScheduleRow[]>)) {
      for (const row of sched) {
        if (row.routeId === routeId || row.routeShort === routeId) rows.push(row);
      }
    }
  }
  return rows;
}

export function getDemoRouteDetail(feedId: string, routeId: string, direction: number) {
  const meta = findRouteMeta(feedId, routeId);
  if (!meta) return null;

  const tripMap = new Map<
    string,
    { trip_id: string; headsign: string | null; first_departure: string }
  >();

  for (const row of collectScheduleRows(feedId, routeId)) {
    const dep = formatDeparture(row.departureTime);
    const existing = tripMap.get(row.tripId);
    if (!existing || dep < existing.first_departure) {
      tripMap.set(row.tripId, {
        trip_id: row.tripId,
        headsign: row.headsign,
        first_departure: dep,
      });
    }
  }

  const trips = [...tripMap.values()]
    .sort((a, b) => a.first_departure.localeCompare(b.first_departure))
    .slice(0, 200);

  const vehicles = getRtVehicles()
    .filter(
      (v) =>
        v.feedId === feedId &&
        (v.routeId === routeId ||
          v.routeId === meta.short_name ||
          meta.short_name === routeId),
    )
    .map((v) => {
      const sched = v.tripId ? lookupTripFromSchedules(feedId, v.tripId) : undefined;
      return {
        vehicle_id: v.vehicleId,
        label: v.label?.trim() || v.vehicleId,
        lat: v.lat!,
        lon: v.lon!,
        headsign: sched?.headsign ?? null,
        delay_sec: v.delaySec ?? null,
      };
    });

  return {
    route: meta,
    direction,
    trips,
    vehicles,
    shape: null,
  };
}
