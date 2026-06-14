import type { RtTripUpdate, RtVehicle } from "./rt-types";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function field(obj: JsonRecord | null | undefined, ...names: string[]): unknown {
  if (!obj) return undefined;
  for (const name of names) {
    if (obj[name] != null) return obj[name];
    const target = name.toLowerCase();
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase() === target && v != null) return v;
    }
  }
  return undefined;
}

function num(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function str(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s || undefined;
}

function entities(payload: unknown): JsonRecord[] {
  const root = record(payload);
  if (!root) return [];
  return asArray(field(root, "entity", "Entity", "entities", "Entities"))
    .map(record)
    .filter((x): x is JsonRecord => x != null);
}

function parseEpoch(value: unknown): number | undefined {
  const n = num(value);
  if (n != null && n > 1_000_000_000) return n;
  if (typeof value === "string") {
    const d = Date.parse(value);
    if (!Number.isNaN(d)) return Math.floor(d / 1000);
  }
  return undefined;
}

/** Metrolinx JSON may use GTFS clock times (16:50:00) instead of unix epochs. */
function parseServiceOrEpoch(value: unknown): number | undefined {
  const epoch = parseEpoch(value);
  if (epoch != null) return epoch;
  if (typeof value === "string") {
    const t = value.trim();
    const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      return (
        Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0)
      );
    }
  }
  return undefined;
}

export function metrolinxJsonOk(payload: unknown): boolean {
  const code = (payload as { Metadata?: { ErrorCode?: string } })?.Metadata?.ErrorCode;
  if (!code) return true;
  return code === "0" || code === "200";
}

export function metrolinxJsonError(payload: unknown): string | null {
  const meta = (payload as { Metadata?: { ErrorCode?: string; ErrorMessage?: string } })
    ?.Metadata;
  if (!meta?.ErrorCode || meta.ErrorCode === "0" || meta.ErrorCode === "200") {
    return null;
  }
  return `${meta.ErrorCode}: ${meta.ErrorMessage ?? "error"}`;
}

export function parseMetrolinxJsonVehicles(
  feedId: string,
  payload: unknown,
): RtVehicle[] {
  const out: RtVehicle[] = [];
  for (const ent of entities(payload)) {
    const vp = record(field(ent, "vehicle", "Vehicle"));
    if (!vp) continue;
    const trip = record(field(vp, "trip", "Trip"));
    const veh = record(field(vp, "vehicle", "Vehicle"));
    const pos = record(field(vp, "position", "Position"));
    const vehicleId =
      str(field(veh, "id", "Id")) ??
      str(field(ent, "id", "Id")) ??
      str(field(vp, "id", "Id"));
    if (!vehicleId) continue;
    out.push({
      feedId,
      vehicleId,
      tripId: str(field(trip, "trip_id", "Trip_id", "TripId")),
      routeId: str(field(trip, "route_id", "Route_id", "RouteId")),
      label: str(field(veh, "label", "Label")),
      lat: num(field(pos, "latitude", "Latitude")),
      lon: num(field(pos, "longitude", "Longitude")),
      bearing: num(field(pos, "bearing", "Bearing")),
      speed: num(field(pos, "speed", "Speed")),
      currentStopSequence: num(
        field(vp, "current_stop_sequence", "Current_stop_sequence", "CurrentStopSequence"),
      ),
      delaySec: num(field(vp, "delay", "Delay")),
    });
  }
  return out;
}

export function parseMetrolinxJsonTripUpdates(
  feedId: string,
  payload: unknown,
): RtTripUpdate[] {
  const out: RtTripUpdate[] = [];
  for (const ent of entities(payload)) {
    const tu = record(field(ent, "trip_update", "Trip_update", "TripUpdate"));
    if (!tu) continue;
    const trip = record(field(tu, "trip", "Trip"));
    const tripId = str(field(trip, "trip_id", "Trip_id", "TripId"));
    if (!tripId) continue;
    const routeId = str(field(trip, "route_id", "Route_id", "RouteId"));
    const stopUpdates = asArray(
      field(
        tu,
        "stop_time_update",
        "Stop_time_update",
        "StopTimeUpdate",
        "stop_time_updates",
        "StopTimeUpdates",
      ),
    );
    for (const stuRaw of stopUpdates) {
      const stu = record(stuRaw);
      if (!stu) continue;
      const stopId = str(field(stu, "stop_id", "Stop_id", "StopId"));
      if (!stopId) continue;
      const arrival = record(field(stu, "arrival", "Arrival"));
      const departure = record(field(stu, "departure", "Departure"));
      out.push({
        feedId,
        tripId,
        routeId,
        stopId,
        stopSequence: num(field(stu, "stop_sequence", "Stop_sequence", "StopSequence")),
        delaySec:
          num(field(arrival, "delay", "Delay")) ??
          num(field(departure, "delay", "Delay")) ??
          num(field(tu, "delay", "Delay")),
        arrivalTime: parseServiceOrEpoch(field(arrival, "time", "Time")),
        departureTime: parseServiceOrEpoch(field(departure, "time", "Time")),
        platform:
          str(field(stu, "platform", "Platform", "track", "Track")) ??
          str(field(stu, "assigned_stop_id", "Assigned_stop_id")),
      });
    }
  }
  return out;
}
