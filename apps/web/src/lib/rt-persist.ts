import { isDatabaseConfigured } from "@gta/db";
import { getSql } from "@/lib/db";
import type { RtTripUpdate, RtVehicle } from "@gta/gtfs-rt";

/** Write latest in-memory GTFS-RT snapshot to Postgres (for serverless / multi-instance). */
export async function persistRtSnapshot(
  vehicles: RtVehicle[],
  tripUpdates: RtTripUpdate[],
) {
  if (!isDatabaseConfigured() || !vehicles.length && !tripUpdates.length) return;

  const sql = getSql();
  const now = new Date();

  for (const v of vehicles) {
    if (v.lat == null || v.lon == null) continue;
    await sql`
      INSERT INTO rt_vehicles (
        feed_id, vehicle_id, trip_id, route_id, label, lat, lon, bearing, speed,
        current_stop_sequence, delay_sec, occupancy_status, updated_at
      ) VALUES (
        ${v.feedId}, ${v.vehicleId}, ${v.tripId ?? null}, ${v.routeId ?? null},
        ${v.label ?? null}, ${v.lat}, ${v.lon},
        ${v.bearing ?? null}, ${v.speed ?? null}, ${v.currentStopSequence ?? null},
        ${v.delaySec ?? null}, ${v.occupancyStatus ?? null}, ${now}
      )
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

  const tripDelays = new Map<string, number>();
  for (const u of tripUpdates) {
    if (u.delaySec != null) tripDelays.set(`${u.feedId}:${u.tripId}`, u.delaySec);
    await sql`
      INSERT INTO rt_trip_updates (
        feed_id, trip_id, stop_id, stop_sequence, delay_sec, arrival_time, departure_time, updated_at
      ) VALUES (
        ${u.feedId}, ${u.tripId}, ${u.stopId}, ${u.stopSequence ?? null},
        ${u.delaySec ?? null}, ${u.arrivalTime ?? null}, ${u.departureTime ?? null}, ${now}
      )
      ON CONFLICT (feed_id, trip_id, stop_id) DO UPDATE SET
        stop_sequence = EXCLUDED.stop_sequence,
        delay_sec = EXCLUDED.delay_sec,
        arrival_time = EXCLUDED.arrival_time,
        departure_time = EXCLUDED.departure_time,
        updated_at = EXCLUDED.updated_at
    `;
  }

  for (const [key, delaySec] of tripDelays) {
    const [feedId, tripId] = key.split(":");
    await sql`
      UPDATE rt_vehicles SET delay_sec = ${delaySec}, updated_at = ${now}
      WHERE feed_id = ${feedId} AND trip_id = ${tripId}
    `;
  }

  const feeds = new Set([
    ...vehicles.map((v) => v.feedId),
    ...tripUpdates.map((u) => u.feedId),
  ]);
  for (const feedId of feeds) {
    await sql`
      INSERT INTO feed_meta (feed_id, rt_updated_at) VALUES (${feedId}, ${now})
      ON CONFLICT (feed_id) DO UPDATE SET rt_updated_at = EXCLUDED.rt_updated_at
    `;
  }
}
