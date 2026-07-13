import { isDatabaseConfigured } from "@gta/db";
import { getSql } from "@/lib/db";
import type { RtTripUpdate, RtVehicle } from "@gta/gtfs-rt";

const CHUNK = 500;
/** Don't rewrite the snapshot more than once a minute per instance. */
const MIN_PERSIST_INTERVAL_MS = 60_000;
let lastPersist = 0;

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Write latest in-memory GTFS-RT snapshot to Postgres (for serverless / multi-instance). */
export async function persistRtSnapshot(
  vehicles: RtVehicle[],
  tripUpdates: RtTripUpdate[],
) {
  if (!isDatabaseConfigured() || (!vehicles.length && !tripUpdates.length)) return;
  if (Date.now() - lastPersist < MIN_PERSIST_INTERVAL_MS) return;
  lastPersist = Date.now();

  const sql = getSql();
  const now = new Date();

  const vehicleRows = vehicles
    .filter((v) => v.lat != null && v.lon != null)
    .map((v) => ({
      feed_id: v.feedId,
      vehicle_id: v.vehicleId,
      trip_id: v.tripId ?? null,
      route_id: v.routeId ?? null,
      label: v.label ?? null,
      lat: v.lat!,
      lon: v.lon!,
      bearing: v.bearing ?? null,
      speed: v.speed ?? null,
      current_stop_sequence: v.currentStopSequence ?? null,
      delay_sec: v.delaySec ?? null,
      occupancy_status: v.occupancyStatus ?? null,
      updated_at: now,
    }));

  for (const chunk of chunks(vehicleRows, CHUNK)) {
    await sql`
      INSERT INTO rt_vehicles ${sql(
        chunk,
        "feed_id",
        "vehicle_id",
        "trip_id",
        "route_id",
        "label",
        "lat",
        "lon",
        "bearing",
        "speed",
        "current_stop_sequence",
        "delay_sec",
        "occupancy_status",
        "updated_at",
      )}
      ON CONFLICT (feed_id, vehicle_id) DO UPDATE SET
        trip_id = EXCLUDED.trip_id,
        route_id = EXCLUDED.route_id,
        label = EXCLUDED.label,
        lat = EXCLUDED.lat,
        lon = EXCLUDED.lon,
        bearing = EXCLUDED.bearing,
        speed = EXCLUDED.speed,
        current_stop_sequence = EXCLUDED.current_stop_sequence,
        delay_sec = EXCLUDED.delay_sec,
        occupancy_status = EXCLUDED.occupancy_status,
        updated_at = EXCLUDED.updated_at
    `;
  }

  // Dedupe on the primary key — multi-row INSERT ... ON CONFLICT fails on
  // duplicate rows within the same statement.
  const updateByKey = new Map<string, RtTripUpdate>();
  for (const u of tripUpdates) {
    updateByKey.set(`${u.feedId}:${u.tripId}:${u.stopId}`, u);
  }
  const updateRows = [...updateByKey.values()].map((u) => ({
    feed_id: u.feedId,
    trip_id: u.tripId,
    stop_id: u.stopId,
    stop_sequence: u.stopSequence ?? null,
    delay_sec: u.delaySec ?? null,
    arrival_time: u.arrivalTime ?? null,
    departure_time: u.departureTime ?? null,
    updated_at: now,
  }));

  for (const chunk of chunks(updateRows, CHUNK)) {
    await sql`
      INSERT INTO rt_trip_updates ${sql(
        chunk,
        "feed_id",
        "trip_id",
        "stop_id",
        "stop_sequence",
        "delay_sec",
        "arrival_time",
        "departure_time",
        "updated_at",
      )}
      ON CONFLICT (feed_id, trip_id, stop_id) DO UPDATE SET
        stop_sequence = EXCLUDED.stop_sequence,
        delay_sec = EXCLUDED.delay_sec,
        arrival_time = EXCLUDED.arrival_time,
        departure_time = EXCLUDED.departure_time,
        updated_at = EXCLUDED.updated_at
    `;
  }

  // Backfill vehicle delay from trip updates in one statement.
  const tripDelays = new Map<string, { feed: string; trip: string; delay: number }>();
  for (const u of tripUpdates) {
    if (u.delaySec != null) {
      tripDelays.set(`${u.feedId}:${u.tripId}`, {
        feed: u.feedId,
        trip: u.tripId,
        delay: u.delaySec,
      });
    }
  }
  if (tripDelays.size > 0) {
    await sql`
      UPDATE rt_vehicles v
      SET delay_sec = (d->>'delay')::int, updated_at = ${now}
      FROM jsonb_array_elements(${JSON.stringify([...tripDelays.values()])}::jsonb) d
      WHERE v.feed_id = d->>'feed' AND v.trip_id = d->>'trip'
    `;
  }

  const feeds = [
    ...new Set([
      ...vehicles.map((v) => v.feedId),
      ...tripUpdates.map((u) => u.feedId),
    ]),
  ];
  if (feeds.length > 0) {
    await sql`
      INSERT INTO feed_meta (feed_id, rt_updated_at)
      SELECT f, ${now} FROM unnest(${feeds}::text[]) f
      ON CONFLICT (feed_id) DO UPDATE SET rt_updated_at = EXCLUDED.rt_updated_at
    `;
  }
}
