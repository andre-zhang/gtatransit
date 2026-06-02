import "dotenv/config";
import { getSql } from "@gta/db";
import {
  RT_FEEDS,
  fetchRt,
  parseTripUpdates,
  parseVehicles,
} from "@gta/gtfs-rt";

const INTERVAL_MS = 15_000;

async function pollFeed(feedId: string) {
  const sql = getSql();
  const cfg = RT_FEEDS[feedId];
  if (!cfg) return;

  const now = new Date();

  if (cfg.vehicles) {
    try {
      const msg = await fetchRt(cfg.vehicles, cfg.headers);
      const vehicles = parseVehicles(feedId, msg);
      for (const v of vehicles) {
        await sql`
          INSERT INTO rt_vehicles (
            feed_id, vehicle_id, trip_id, route_id, label, lat, lon, bearing, speed,
            current_stop_sequence, delay_sec, occupancy_status, updated_at
          ) VALUES (
            ${v.feedId}, ${v.vehicleId}, ${v.tripId ?? null}, ${v.routeId ?? null},
            ${v.label ?? null}, ${v.lat ?? null}, ${v.lon ?? null},
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
    } catch (e) {
      console.error(`${feedId} vehicles:`, e);
    }
  }

  if (cfg.tripUpdates) {
    try {
      const msg = await fetchRt(cfg.tripUpdates, cfg.headers);
      const updates = parseTripUpdates(feedId, msg);
      const tripDelays = new Map<string, number>();
      for (const u of updates) {
        if (u.delaySec != null) tripDelays.set(u.tripId, u.delaySec);
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
      for (const [tripId, delaySec] of tripDelays) {
        await sql`
          UPDATE rt_vehicles SET delay_sec = ${delaySec}, updated_at = ${now}
          WHERE feed_id = ${feedId} AND trip_id = ${tripId}
        `;
      }
    } catch (e) {
      console.error(`${feedId} trip updates:`, e);
    }
  }

  await sql`
    INSERT INTO feed_meta (feed_id, rt_updated_at) VALUES (${feedId}, ${now})
    ON CONFLICT (feed_id) DO UPDATE SET rt_updated_at = EXCLUDED.rt_updated_at
  `;
}

async function pollGo() {
  const key = process.env.METROLINX_API_KEY;
  if (!key) {
    console.warn("METROLINX_API_KEY not set — skipping GO RT");
    return;
  }
  const sql = getSql();
  const now = new Date();
  const headers = { "Ocp-Apim-Subscription-Key": key };

  for (const [kind, path] of [
    ["vehicles", "GTFS/VehiclePositions"],
    ["trips", "GTFS/TripUpdates"],
  ] as const) {
    try {
      const url = `https://api.openmetrolinx.com/OpenDataAPI/${path}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      const { decodeFeed, parseVehicles, parseTripUpdates } = await import("@gta/gtfs-rt");
      const msg = decodeFeed(await res.arrayBuffer());
      if (kind === "vehicles") {
        for (const v of parseVehicles("go", msg)) {
          await sql`
            INSERT INTO rt_vehicles (
              feed_id, vehicle_id, trip_id, route_id, label, lat, lon, bearing, speed,
              current_stop_sequence, delay_sec, updated_at
            ) VALUES (
              ${v.feedId}, ${v.vehicleId}, ${v.tripId ?? null}, ${v.routeId ?? null},
              ${v.label ?? null}, ${v.lat ?? null}, ${v.lon ?? null},
              ${v.bearing ?? null}, ${v.speed ?? null}, ${v.currentStopSequence ?? null},
              ${v.delaySec ?? null}, ${now}
            )
            ON CONFLICT (feed_id, vehicle_id) DO UPDATE SET
              trip_id = EXCLUDED.trip_id, route_id = EXCLUDED.route_id, label = EXCLUDED.label,
              lat = EXCLUDED.lat, lon = EXCLUDED.lon, bearing = EXCLUDED.bearing,
              updated_at = EXCLUDED.updated_at
          `;
        }
      } else {
        for (const u of parseTripUpdates("go", msg)) {
          await sql`
            INSERT INTO rt_trip_updates (
              feed_id, trip_id, stop_id, stop_sequence, delay_sec, updated_at
            ) VALUES (
              ${u.feedId}, ${u.tripId}, ${u.stopId}, ${u.stopSequence ?? null},
              ${u.delaySec ?? null}, ${now}
            )
            ON CONFLICT (feed_id, trip_id, stop_id) DO UPDATE SET delay_sec = EXCLUDED.delay_sec, updated_at = EXCLUDED.updated_at
          `;
        }
      }
    } catch (e) {
      console.error(`go ${kind}:`, e);
    }
  }
  await sql`
    INSERT INTO feed_meta (feed_id, rt_updated_at) VALUES ('go', ${new Date()})
    ON CONFLICT (feed_id) DO UPDATE SET rt_updated_at = EXCLUDED.rt_updated_at
  `;
}

async function tick() {
  for (const feedId of Object.keys(RT_FEEDS)) {
    await pollFeed(feedId);
  }
  await pollGo();
  console.log(`RT poll ${new Date().toISOString()}`);
}

console.log("RT poller started");
await tick();
setInterval(() => {
  tick().catch(console.error);
}, INTERVAL_MS);
