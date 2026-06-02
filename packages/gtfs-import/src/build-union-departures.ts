import { existsSync } from "node:fs";
import { join } from "node:path";
import { pick, readCsv } from "./csv.js";
import {
  loadActiveServices,
  resolveServiceDate,
  secToTime,
  timeToSec,
} from "./gtfs-calendar.js";
import { routeIdFromRow } from "./route-id.js";

const UNION = { lat: 43.6453, lon: -79.3806 };
const RADIUS_KM = 0.45;

const GO_LINE: Record<string, string> = {
  "01": "#e57200",
  "02": "#00843d",
  "03": "#ffd100",
  "04": "#0080c0",
  "05": "#0080c0",
  "06": "#8b008b",
  "07": "#c8102e",
};

const AGENCY_COLORS: Record<string, string> = {
  ttc: "#da291c",
  go: "#007934",
  yrt: "#0072ce",
  brampton: "#e87722",
  drt: "#003da5",
  miway: "#00a651",
};

function routeColor(feedId: string, shortName: string | null, hex?: string | null): string {
  if (hex) return `#${hex.replace(/^#/, "")}`;
  if (feedId === "go" && shortName) {
    const c = GO_LINE[shortName.padStart(2, "0")];
    if (c) return c;
  }
  return AGENCY_COLORS[feedId] ?? "#007934";
}

function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type DemoDepartureRaw = {
  feedId: string;
  tripId: string;
  routeId: string;
  serviceId: string;
  departureTime: string;
  headsign: string;
  routeShort: string;
  routeColor: string;
  stopId: string;
};

export async function buildUnionDepartures(
  feedDirs: Array<{ feedId: string; dir: string }>,
): Promise<DemoDepartureRaw[]> {
  const all: DemoDepartureRaw[] = [];

  for (const { feedId, dir } of feedDirs) {
    if (!existsSync(join(dir, "stops.txt"))) continue;

    const stopIds = new Set<string>();
    for await (const row of readCsv(join(dir, "stops.txt"))) {
      const id = pick(row, "stop_id");
      const lat = Number(pick(row, "stop_lat"));
      const lon = Number(pick(row, "stop_lon"));
      if (!id || Number.isNaN(lat) || Number.isNaN(lon)) continue;
      if (distKm(lat, lon, UNION.lat, UNION.lon) <= RADIUS_KM) stopIds.add(id);
    }
    if (!stopIds.size) continue;

    const calendarPath = join(dir, "calendar.txt");
    const calendarDatesPath = join(dir, "calendar_dates.txt");
    const calendarRows: Array<{
      service_id: string;
      start_date: string;
      end_date: string;
      monday: string;
      tuesday: string;
      wednesday: string;
      thursday: string;
      friday: string;
      saturday: string;
      sunday: string;
    }> = [];
    if (existsSync(calendarPath)) {
      for await (const row of readCsv(calendarPath)) {
        calendarRows.push({
          service_id: pick(row, "service_id"),
          start_date: pick(row, "start_date"),
          end_date: pick(row, "end_date"),
          monday: pick(row, "monday") || "0",
          tuesday: pick(row, "tuesday") || "0",
          wednesday: pick(row, "wednesday") || "0",
          thursday: pick(row, "thursday") || "0",
          friday: pick(row, "friday") || "0",
          saturday: pick(row, "saturday") || "0",
          sunday: pick(row, "sunday") || "0",
        });
      }
    }
    const calendarDateRows: Array<{ service_id: string; date: string; exception_type: string }> =
      [];
    if (existsSync(calendarDatesPath)) {
      for await (const row of readCsv(calendarDatesPath)) {
        calendarDateRows.push({
          service_id: pick(row, "service_id"),
          date: pick(row, "date"),
          exception_type: pick(row, "exception_type"),
        });
      }
    }
    const date = resolveServiceDate(calendarRows, calendarDateRows);
    const activeServices = loadActiveServices(calendarRows, calendarDateRows, date);

    const routes = new Map<string, { shortName: string | null; color: string }>();
    for await (const row of readCsv(join(dir, "routes.txt"))) {
      const id = routeIdFromRow(row);
      if (!id) continue;
      routes.set(id, {
        shortName: pick(row, "route_short_name") || null,
        color: routeColor(feedId, pick(row, "route_short_name"), pick(row, "route_color") || null),
      });
    }

    const trips = new Map<
      string,
      { routeId: string; serviceId: string; headsign: string }
    >();
    for await (const row of readCsv(join(dir, "trips.txt"))) {
      const tripId = pick(row, "trip_id");
      const routeId = pick(row, "route_id");
      const serviceId = pick(row, "service_id");
      if (!tripId || !routeId || !serviceId) continue;
      if (!activeServices.has(serviceId)) continue;
      trips.set(tripId, {
        routeId,
        serviceId,
        headsign: pick(row, "trip_headsign") || pick(row, "trip_short_name") || "",
      });
    }

    const stopTimesPath = join(dir, "stop_times.txt");
    if (!existsSync(stopTimesPath)) continue;

    for await (const row of readCsv(stopTimesPath)) {
      const stopId = pick(row, "stop_id");
      if (!stopIds.has(stopId)) continue;
      const tripId = pick(row, "trip_id");
      const trip = trips.get(tripId);
      if (!trip) continue;
      const departureTime = pick(row, "departure_time") || pick(row, "arrival_time");
      if (!departureTime) continue;
      const route = routes.get(trip.routeId);
      all.push({
        feedId,
        tripId,
        routeId: trip.routeId,
        serviceId: trip.serviceId,
        departureTime,
        headsign: trip.headsign,
        routeShort: route?.shortName ?? trip.routeId,
        routeColor: route?.color ?? routeColor(feedId, null, null),
        stopId,
      });
    }
  }

  all.sort((a, b) => timeToSec(a.departureTime) - timeToSec(b.departureTime));
  return all;
}

export { secToTime, timeToSec, torontoNowSec } from "./gtfs-calendar.js";
