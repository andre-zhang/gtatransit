import { existsSync } from "node:fs";
import { join } from "node:path";
import { pick, readCsv } from "./csv.js";
import {
  loadActiveServices,
  resolveServiceDate,
} from "./gtfs-calendar.js";
import { routeIdFromRow } from "./route-id.js";

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
  up: "#0075d2",
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

export type DemoStopMember = { feedId: string; stopId: string };
export type DemoStopMeta = {
  name: string;
  members: DemoStopMember[];
};
export type ScheduleRow = {
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

export type TripStopRow = {
  stopId: string;
  name: string;
  sequence: number;
  arrivalTime: string;
  departureTime: string;
};

export async function loadGoStops(dir: string): Promise<
  Array<{ stopId: string; name: string; lat: number; lon: number }>
> {
  const out: Array<{ stopId: string; name: string; lat: number; lon: number }> = [];
  for await (const row of readCsv(join(dir, "stops.txt"))) {
    const stopId = pick(row, "stop_id");
    const lat = Number(pick(row, "stop_lat"));
    const lon = Number(pick(row, "stop_lon"));
    const name = pick(row, "stop_name");
    if (!stopId || Number.isNaN(lat) || Number.isNaN(lon)) continue;
    out.push({ stopId, name, lat, lon });
  }
  return out;
}

/** Stops served today on routes whose route_type is in routeTypes. */
export async function loadStopsUsedByRouteTypes(
  dir: string,
  routeTypes: number[],
): Promise<Array<{ stopId: string; name: string; lat: number; lon: number }>> {
  const { date, activeServices } = await loadCalendar(dir);
  const types = new Set(routeTypes);

  const routeIds = new Set<string>();
  for await (const row of readCsv(join(dir, "routes.txt"))) {
    const id = routeIdFromRow(row);
    if (id && types.has(Number(pick(row, "route_type") || 3))) routeIds.add(id);
  }

  const activeTrips = new Set<string>();
  for await (const row of readCsv(join(dir, "trips.txt"))) {
    const tripId = pick(row, "trip_id");
    const routeId = pick(row, "route_id");
    const serviceId = pick(row, "service_id");
    if (!tripId || !routeIds.has(routeId) || !activeServices.has(serviceId)) continue;
    activeTrips.add(tripId);
  }

  const stopIds = new Set<string>();
  const stopTimesPath = join(dir, "stop_times.txt");
  if (existsSync(stopTimesPath)) {
    for await (const row of readCsv(stopTimesPath)) {
      if (activeTrips.has(pick(row, "trip_id"))) stopIds.add(pick(row, "stop_id"));
    }
  }

  const out: Array<{ stopId: string; name: string; lat: number; lon: number }> = [];
  for await (const row of readCsv(join(dir, "stops.txt"))) {
    const stopId = pick(row, "stop_id");
    if (!stopIds.has(stopId)) continue;
    const lat = Number(pick(row, "stop_lat"));
    const lon = Number(pick(row, "stop_lon"));
    const name = pick(row, "stop_name");
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    out.push({ stopId, name, lat, lon });
  }
  return out;
}

export async function loadTtcSubwayStops(dir: string): Promise<
  Array<{ stopId: string; name: string; lat: number; lon: number }>
> {
  const subwayRoutes = new Set<string>();
  for await (const row of readCsv(join(dir, "routes.txt"))) {
    if (Number(pick(row, "route_type") || 3) === 1) {
      subwayRoutes.add(routeIdFromRow(row));
    }
  }

  const subwayStops = new Set<string>();
  for await (const row of readCsv(join(dir, "trips.txt"))) {
    if (!subwayRoutes.has(pick(row, "route_id"))) continue;
    /* stop ids collected via stop_times below */
  }

  const stops = new Map<string, { name: string; lat: number; lon: number }>();
  for await (const row of readCsv(join(dir, "stops.txt"))) {
    const stopId = pick(row, "stop_id");
    stops.set(stopId, {
      name: pick(row, "stop_name"),
      lat: Number(pick(row, "stop_lat")),
      lon: Number(pick(row, "stop_lon")),
    });
  }

  const { activeServices } = await loadCalendar(dir);
  const tripRoute = new Map<string, string>();
  for await (const row of readCsv(join(dir, "trips.txt"))) {
    const rid = pick(row, "route_id");
    const tripId = pick(row, "trip_id");
    const serviceId = pick(row, "service_id");
    if (!tripId || !subwayRoutes.has(rid) || !activeServices.has(serviceId)) continue;
    tripRoute.set(tripId, rid);
  }

  for await (const row of readCsv(join(dir, "stop_times.txt"))) {
    const tripId = pick(row, "trip_id");
    if (!tripRoute.has(tripId)) continue;
    subwayStops.add(pick(row, "stop_id"));
  }

  const out: Array<{ stopId: string; name: string; lat: number; lon: number }> = [];
  for (const stopId of subwayStops) {
    const s = stops.get(stopId);
    if (!s || Number.isNaN(s.lat)) continue;
    out.push({ stopId, name: s.name, lat: s.lat, lon: s.lon });
  }
  return out;
}

async function loadCalendar(dir: string): Promise<{ date: string; activeServices: Set<string> }> {
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
  const calendarPath = join(dir, "calendar.txt");
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
  const calendarDatesPath = join(dir, "calendar_dates.txt");
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
  return { date, activeServices };
}

/** Stream stop_times once — schedules by stop_id + trip stop lists. */
export async function buildFeedSchedules(
  feedId: string,
  dir: string,
  targetStopIds: Set<string>,
): Promise<{
  schedulesByStop: Record<string, ScheduleRow[]>;
  tripStops: Record<string, TripStopRow[]>;
}> {
  const { date, activeServices } = await loadCalendar(dir);

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
    const serviceId = pick(row, "service_id");
    if (!tripId || !serviceId || !activeServices.has(serviceId)) continue;
    trips.set(tripId, {
      routeId: pick(row, "route_id"),
      serviceId,
      headsign: pick(row, "trip_headsign") || pick(row, "trip_short_name") || "",
    });
  }

  const stopNames = new Map<string, string>();
  for await (const row of readCsv(join(dir, "stops.txt"))) {
    stopNames.set(pick(row, "stop_id"), pick(row, "stop_name"));
  }

  const schedulesByStop: Record<string, ScheduleRow[]> = {};
  const tripStops: Record<string, TripStopRow[]> = {};
  const tripsServingTarget = new Set<string>();

  const stopTimesPath = join(dir, "stop_times.txt");
  if (!existsSync(stopTimesPath)) {
    return { schedulesByStop, tripStops };
  }

  for await (const row of readCsv(stopTimesPath)) {
    const tripId = pick(row, "trip_id");
    const trip = trips.get(tripId);
    if (!trip) continue;

    const stopId = pick(row, "stop_id");
    const departureTime = pick(row, "departure_time") || pick(row, "arrival_time");
    if (!stopId || !departureTime) continue;
    if (!targetStopIds.has(stopId)) continue;

    tripsServingTarget.add(tripId);
    const route = routes.get(trip.routeId);
    const sched: ScheduleRow = {
      feedId,
      tripId,
      routeId: trip.routeId,
      serviceId: trip.serviceId,
      departureTime,
      headsign: trip.headsign,
      routeShort: route?.shortName ?? trip.routeId,
      routeColor: route?.color ?? routeColor(feedId, null, null),
      stopId,
    };
    if (!schedulesByStop[stopId]) schedulesByStop[stopId] = [];
    schedulesByStop[stopId]!.push(sched);
  }

  const tripStopBuf = new Map<string, TripStopRow[]>();
  for await (const row of readCsv(stopTimesPath)) {
    const tripId = pick(row, "trip_id");
    if (!tripsServingTarget.has(tripId)) continue;
    const trip = trips.get(tripId);
    if (!trip) continue;

    const stopId = pick(row, "stop_id");
    const departureTime = pick(row, "departure_time") || pick(row, "arrival_time");
    const arrivalTime = pick(row, "arrival_time") || departureTime;
    const sequence = Number(pick(row, "stop_sequence") || 0);
    if (!stopId || !departureTime) continue;

    if (!tripStopBuf.has(tripId)) tripStopBuf.set(tripId, []);
    tripStopBuf.get(tripId)!.push({
      stopId,
      name: stopNames.get(stopId) ?? stopId,
      sequence,
      arrivalTime,
      departureTime,
    });
  }

  for (const [tripId, stops] of tripStopBuf) {
    tripStops[tripId] = stops.sort((a, b) => a.sequence - b.sequence);
  }

  for (const stopId of Object.keys(schedulesByStop)) {
    schedulesByStop[stopId]!.sort((a, b) =>
      a.departureTime.localeCompare(b.departureTime, undefined, { numeric: true }),
    );
  }

  return { schedulesByStop, tripStops };
}
