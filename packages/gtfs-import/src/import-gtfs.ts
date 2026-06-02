import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";
import "dotenv/config";
import { getSql, closeDb } from "@gta/db";
import { FEEDS } from "./feeds.js";
import { pick, readCsv } from "./csv.js";
import { routeIdFromRow } from "./route-id.js";

const dataDir = process.env.GTFS_DATA_DIR ?? "./data/gtfs";
const BATCH = 5000;

function findGtfsDir(dir: string): string | null {
  if (existsSync(join(dir, "stops.txt"))) return dir;
  for (const name of readdirSync(dir)) {
    const child = join(dir, name);
    const found = findGtfsDir(child);
    if (found) return found;
  }
  return null;
}

async function extractZip(zipPath: string, outDir: string) {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  await pipeline(
    createReadStream(zipPath),
    unzipper.Extract({ path: outDir }),
  );
  return findGtfsDir(outDir) ?? outDir;
}

function zipPath(feedId: string, localPath?: string) {
  if (localPath && existsSync(localPath)) return localPath;
  return join(dataDir, `${feedId}.zip`);
}

function timeToSec(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return (h % 24) * 3600 + m * 60 + (s || 0);
}

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

async function importFeed(feedId: string, name: string, dir: string) {
  const sql = getSql();
  console.log(`Importing ${feedId} from ${dir}`);

  await sql`DELETE FROM stop_times WHERE feed_id = ${feedId}`;
  await sql`DELETE FROM route_shapes WHERE feed_id = ${feedId}`;
  await sql`DELETE FROM trips WHERE feed_id = ${feedId}`;
  await sql`DELETE FROM stops WHERE feed_id = ${feedId}`;
  await sql`DELETE FROM routes WHERE feed_id = ${feedId}`;
  await sql`DELETE FROM agencies WHERE feed_id = ${feedId}`;
  await sql`DELETE FROM calendar_dates WHERE feed_id = ${feedId}`;
  await sql`DELETE FROM calendar WHERE feed_id = ${feedId}`;

  let version = "";
  const feedInfoPath = join(dir, "feed_info.txt");
  if (existsSync(feedInfoPath)) {
    for await (const row of readCsv(feedInfoPath)) {
      version = pick(row, "version") || pick(row, "feed_version");
    }
  }

  await sql`
    INSERT INTO feeds (id, name, version, imported_at)
    VALUES (${feedId}, ${name}, ${version}, NOW())
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, version = EXCLUDED.version, imported_at = NOW()
  `;

  const agenciesPath = join(dir, "agency.txt");
  if (existsSync(agenciesPath)) {
    for await (const row of readCsv(agenciesPath)) {
      await sql`
        INSERT INTO agencies (feed_id, agency_id, name, url, timezone)
        VALUES (${feedId}, ${pick(row, "agency_id")}, ${pick(row, "agency_name")}, ${pick(row, "agency_url") || null}, ${pick(row, "agency_timezone") || "America/Toronto"})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  const routesPath = join(dir, "routes.txt");
  if (existsSync(routesPath)) {
    for await (const row of readCsv(routesPath)) {
      const routeId = routeIdFromRow(row);
      if (!routeId) continue;
      await sql`
        INSERT INTO routes (feed_id, route_id, agency_id, short_name, long_name, route_type, color, text_color)
        VALUES (
          ${feedId},
          ${routeId},
          ${pick(row, "agency_id")},
          ${pick(row, "route_short_name") || null},
          ${pick(row, "route_long_name") || null},
          ${Number(pick(row, "route_type") || 3)},
          ${pick(row, "route_color") || null},
          ${pick(row, "route_text_color") || null}
        )
        ON CONFLICT DO NOTHING
      `;
    }
  }

  const calPath = join(dir, "calendar.txt");
  if (existsSync(calPath)) {
    for await (const row of readCsv(calPath)) {
      await sql`
        INSERT INTO calendar (feed_id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
        VALUES (
          ${feedId}, ${pick(row, "service_id")},
          ${pick(row, "monday") === "1"}, ${pick(row, "tuesday") === "1"},
          ${pick(row, "wednesday") === "1"}, ${pick(row, "thursday") === "1"},
          ${pick(row, "friday") === "1"}, ${pick(row, "saturday") === "1"},
          ${pick(row, "sunday") === "1"},
          ${pick(row, "start_date")}, ${pick(row, "end_date")}
        )
        ON CONFLICT DO NOTHING
      `;
    }
  }

  const calDatesPath = join(dir, "calendar_dates.txt");
  if (existsSync(calDatesPath)) {
    for await (const row of readCsv(calDatesPath)) {
      await sql`
        INSERT INTO calendar_dates (feed_id, service_id, date, exception_type)
        VALUES (${feedId}, ${pick(row, "service_id")}, ${pick(row, "date")}, ${Number(pick(row, "exception_type"))})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  const stopCoords = new Map<string, { lat: number; lon: number; name: string }>();
  const stopsPath = join(dir, "stops.txt");
  if (existsSync(stopsPath)) {
    for await (const row of readCsv(stopsPath)) {
      const stopId = pick(row, "stop_id");
      const lat = Number(pick(row, "stop_lat"));
      const lon = Number(pick(row, "stop_lon"));
      if (!stopId || Number.isNaN(lat)) continue;
      stopCoords.set(stopId, { lat, lon, name: pick(row, "stop_name") });
      await sql`
        INSERT INTO stops (feed_id, stop_id, name, lat, lon, location_type, parent_station, geom)
        VALUES (
          ${feedId}, ${stopId}, ${pick(row, "stop_name")},
          ${lat}, ${lon},
          ${Number(pick(row, "location_type") || 0)},
          ${pick(row, "parent_station") || null},
          ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        )
        ON CONFLICT DO NOTHING
      `;
    }
  }

  const tripsPath = join(dir, "trips.txt");
  const tripDir = new Map<string, number>();
  if (existsSync(tripsPath)) {
    for await (const row of readCsv(tripsPath)) {
      const tripId = pick(row, "trip_id");
      const dirId = pick(row, "direction_id");
      if (dirId) tripDir.set(tripId, Number(dirId));
      await sql`
        INSERT INTO trips (feed_id, trip_id, route_id, service_id, headsign, direction_id, block_id, shape_id)
        VALUES (
          ${feedId}, ${tripId}, ${pick(row, "route_id")}, ${pick(row, "service_id")},
          ${pick(row, "trip_headsign") || null},
          ${dirId ? Number(dirId) : null},
          ${pick(row, "block_id") || null},
          ${pick(row, "shape_id") || null}
        )
        ON CONFLICT DO NOTHING
      `;
    }
  }

  const stopTripCount = new Map<string, number>();
  const stopTimesPath = join(dir, "stop_times.txt");
  if (existsSync(stopTimesPath)) {
    let batch: Array<{
      feedId: string;
      tripId: string;
      arrival: string;
      departure: string;
      stopId: string;
      seq: number;
    }> = [];

    const flush = async () => {
      if (!batch.length) return;
      await sql`
        INSERT INTO stop_times ${sql(
          batch.map((b) => ({
            feed_id: b.feedId,
            trip_id: b.tripId,
            arrival_time: b.arrival,
            departure_time: b.departure,
            stop_id: b.stopId,
            stop_sequence: b.seq,
          })),
        )}
        ON CONFLICT DO NOTHING
      `;
      batch = [];
    };

    for await (const row of readCsv(stopTimesPath)) {
      const stopId = pick(row, "stop_id");
      stopTripCount.set(stopId, (stopTripCount.get(stopId) ?? 0) + 1);
      batch.push({
        feedId,
        tripId: pick(row, "trip_id"),
        arrival: pick(row, "arrival_time"),
        departure: pick(row, "departure_time"),
        stopId,
        seq: Number(pick(row, "stop_sequence")),
      });
      if (batch.length >= BATCH) await flush();
    }
    await flush();
  }

  for (const [stopId, count] of stopTripCount) {
    await sql`UPDATE stops SET trip_count = ${count} WHERE feed_id = ${feedId} AND stop_id = ${stopId}`;
  }

  const shapesPath = join(dir, "shapes.txt");
  const shapePoints = new Map<string, Array<{ lat: number; lon: number; seq: number }>>();
  if (existsSync(shapesPath)) {
    for await (const row of readCsv(shapesPath)) {
      const shapeId = pick(row, "shape_id");
      if (!shapeId) continue;
      if (!shapePoints.has(shapeId)) shapePoints.set(shapeId, []);
      shapePoints.get(shapeId)!.push({
        lat: Number(pick(row, "shape_pt_lat")),
        lon: Number(pick(row, "shape_pt_lon")),
        seq: Number(pick(row, "shape_pt_sequence")),
      });
    }
  }

  const tripShape = new Map<string, string>();
  if (existsSync(tripsPath)) {
    for await (const row of readCsv(tripsPath)) {
      const sid = pick(row, "shape_id");
      if (sid) tripShape.set(pick(row, "trip_id"), sid);
    }
  }

  const stopBearings = new Map<string, number[]>();
  if (existsSync(stopTimesPath)) {
    let prevTrip = "";
    let prevStop: { id: string; lat: number; lon: number } | null = null;
    for await (const row of readCsv(stopTimesPath)) {
      const tripId = pick(row, "trip_id");
      const stopId = pick(row, "stop_id");
      const coord = stopCoords.get(stopId);
      if (!coord) continue;
      if (tripId !== prevTrip) {
        prevTrip = tripId;
        prevStop = { id: stopId, lat: coord.lat, lon: coord.lon };
        continue;
      }
      if (prevStop && prevStop.id !== stopId) {
        const b = bearing(prevStop.lat, prevStop.lon, coord.lat, coord.lon);
        if (!stopBearings.has(stopId)) stopBearings.set(stopId, []);
        stopBearings.get(stopId)!.push(b);
      }
      prevStop = { id: stopId, lat: coord.lat, lon: coord.lon };
    }
  }

  for (const [stopId, bearings] of stopBearings) {
    const avg =
      bearings.reduce((a, b) => a + b, 0) / bearings.length;
    const dirId = tripDir.get(stopId) ?? null;
    await sql`
      UPDATE stops SET bearing = ${avg}, direction_id = COALESCE(direction_id, ${dirId})
      WHERE feed_id = ${feedId} AND stop_id = ${stopId}
    `;
  }

  const routeDirs = new Map<string, Map<number, string>>();
  if (existsSync(tripsPath)) {
    for await (const row of readCsv(tripsPath)) {
      const routeId = pick(row, "route_id");
      const shapeId = pick(row, "shape_id");
      const dir = Number(pick(row, "direction_id") || 0);
      if (!shapeId || !shapePoints.has(shapeId)) continue;
      if (!routeDirs.has(routeId)) routeDirs.set(routeId, new Map());
      const pts = shapePoints.get(shapeId)!.sort((a, b) => a.seq - b.seq);
      const coords = pts.map((p) => [p.lon, p.lat]);
      if (coords.length < 2) continue;
      const geojson = JSON.stringify({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
      });
      routeDirs.get(routeId)!.set(dir, geojson);
    }
  }

  for (const [routeId, dirs] of routeDirs) {
    for (const [dir, geojson] of dirs) {
      await sql`
        INSERT INTO route_shapes (feed_id, route_id, direction_id, geojson, geom)
        VALUES (
          ${feedId}, ${routeId}, ${dir}, ${geojson},
          ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)
        )
        ON CONFLICT (feed_id, route_id, direction_id) DO UPDATE SET geojson = EXCLUDED.geojson, geom = EXCLUDED.geom
      `;
    }
  }

  console.log(`${feedId}: import complete (v${version})`);
}

async function main() {
  mkdirSync(dataDir, { recursive: true });
  const extractRoot = join(dataDir, "extracted");

  for (const feed of FEEDS) {
    const zp = zipPath(feed.id, feed.localPath);
    if (!existsSync(zp)) {
      console.warn(`Skip ${feed.id}: missing ${zp}`);
      continue;
    }
    const outDir = join(extractRoot, feed.id);
    const gtfsDir = await extractZip(zp, outDir);
    await importFeed(feed.id, feed.name, gtfsDir);
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
