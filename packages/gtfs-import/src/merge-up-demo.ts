/**
 * Merge UP Express GTFS into existing demo fixtures without rebuilding TTC/GO.
 * Run: npx tsx packages/gtfs-import/src/merge-up-demo.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import unzipper from "unzipper";
import { pick, readCsv } from "./csv.js";
import { routeIdFromRow } from "./route-id.js";
import { buildFeedSchedules, loadGoStops } from "./build-demo-stops.js";
import { writeShardedRecord } from "./write-sharded-json.js";
import { smoothRouteLine } from "./smooth-line.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const dataDir = join(root, "data/gtfs");
const outDir = join(root, "apps/web/public/demo");
const upZip = join(dataDir, "up.zip");
const upDir = join(dataDir, "extracted-demo/up");

const UP_COLOR = "#0075D2";
const TORONTO_UNION_ID = "toronto-union";

async function ensureUpExtracted() {
  if (!existsSync(upZip)) {
    const res = await fetch(
      "https://assets.metrolinx.com/raw/upload/v1682367798/Documents/Metrolinx/Open%20Data/UP-GTFS.zip",
    );
    if (!res.ok) throw new Error(`UP GTFS download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(upZip, buf);
  }
  if (!existsSync(join(upDir, "routes.txt"))) {
    mkdirSync(upDir, { recursive: true });
    await pipeline(createReadStream(upZip), unzipper.Extract({ path: upDir }));
  }
}

async function loadUpRouteFeatures(dir: string) {
  const routes: Array<{
    id: string;
    shortName: string | null;
    longName: string | null;
    routeType: number;
    color: string;
  }> = [];
  for await (const row of readCsv(join(dir, "routes.txt"))) {
    const id = routeIdFromRow(row);
    if (!id) continue;
    routes.push({
      id,
      shortName: pick(row, "route_short_name") || null,
      longName: pick(row, "route_long_name") || null,
      routeType: Number(pick(row, "route_type") || 2),
      color: UP_COLOR,
    });
  }

  const tripShape = new Map<string, string>();
  for await (const row of readCsv(join(dir, "trips.txt"))) {
    const tid = pick(row, "trip_id");
    const sid = pick(row, "shape_id");
    if (tid && sid) tripShape.set(tid, sid);
  }
  const tripRoute = new Map<string, { routeId: string; direction: number }>();
  for await (const row of readCsv(join(dir, "trips.txt"))) {
    tripRoute.set(pick(row, "trip_id"), {
      routeId: pick(row, "route_id"),
      direction: Number(pick(row, "direction_id") || 0),
    });
  }

  const shapePoints = new Map<string, Array<{ lat: number; lon: number; seq: number }>>();
  for await (const row of readCsv(join(dir, "shapes.txt"))) {
    const sid = pick(row, "shape_id");
    if (!sid) continue;
    if (!shapePoints.has(sid)) shapePoints.set(sid, []);
    shapePoints.get(sid)!.push({
      lat: Number(pick(row, "shape_pt_lat")),
      lon: Number(pick(row, "shape_pt_lon")),
      seq: Number(pick(row, "shape_pt_sequence")),
    });
  }

  const routeShape = new Map<string, Map<number, number[][]>>();
  for (const [tripId, { routeId, direction }] of tripRoute) {
    const sid = tripShape.get(tripId);
    if (!sid || !shapePoints.has(sid)) continue;
    const existing = routeShape.get(routeId);
    if (existing?.has(direction)) continue;
    const pts = shapePoints.get(sid)!.sort((a, b) => a.seq - b.seq);
    if (pts.length < 2) continue;
    const coords = pts.map((p) => [p.lon, p.lat]);
    if (!routeShape.has(routeId)) routeShape.set(routeId, new Map());
    routeShape.get(routeId)!.set(direction, coords);
  }

  const features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: number[][] };
    properties: Record<string, unknown>;
  }> = [];

  for (const [routeId, dirs] of routeShape) {
    const r = routes.find((x) => x.id === routeId);
    if (!r) continue;
    for (const [directionId, coords] of dirs) {
      if (coords.length < 2) continue;
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: smoothRouteLine(coords, r.routeType),
        },
        properties: {
          feedId: "up",
          routeId,
          routeShort: r.shortName,
          directionId,
          routeType: r.routeType,
          color: r.color,
        },
      });
    }
  }

  return { routes, features };
}

async function main() {
  await ensureUpExtracted();

  const upStops = await loadGoStops(upDir);
  const stopIds = new Set(upStops.map((s) => s.stopId));
  const { schedulesByStop, tripStops } = await buildFeedSchedules("up", upDir, stopIds);
  const { routes, features: upRouteFeatures } = await loadUpRouteFeatures(upDir);

  const fixturesPath = join(outDir, "fixtures.json");
  const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as {
    filterTree: {
      agencies: Array<{
        id: string;
        name: string;
        modes: Array<{
          type: number;
          label: string;
          routes: Array<{ id: string; shortName: string | null; longName: string | null }>;
        }>;
      }>;
    };
    stops: Record<string, { name: string; members: Array<{ feedId: string; stopId: string }> }>;
  };

  // Remove stale GO bus route 35 (UP moved to separate GTFS).
  const goAgency = fixtures.filterTree.agencies.find((a) => a.id === "go");
  if (goAgency) {
    for (const mode of goAgency.modes) {
      mode.routes = mode.routes.filter(
        (r) => !(r.shortName === "35" && /pearson/i.test(r.longName ?? "")),
      );
    }
  }

  fixtures.filterTree.agencies = fixtures.filterTree.agencies.filter((a) => a.id !== "up");
  fixtures.filterTree.agencies.push({
    id: "up",
    name: "UP Express",
    modes: [
      {
        type: 2,
        label: "Rail",
        routes: routes.map((r) => ({
          id: r.id,
          shortName: r.shortName,
          longName: r.longName,
        })),
      },
    ],
  });
  fixtures.filterTree.agencies.sort((a, b) => a.name.localeCompare(b.name));

  for (const s of upStops) {
    const groupId = `up-${s.stopId}`;
    fixtures.stops[groupId] = {
      name: s.name,
      members: [{ feedId: "up", stopId: s.stopId }],
    };
  }

  const union = fixtures.stops[TORONTO_UNION_ID];
  if (union && !union.members.some((m) => m.feedId === "up" && m.stopId === "UN")) {
    union.members.push({ feedId: "up", stopId: "UN" });
  }

  writeFileSync(fixturesPath, JSON.stringify(fixtures));

  const routesPath = join(outDir, "routes.json");
  const routesGeo = JSON.parse(readFileSync(routesPath, "utf8")) as {
    type: "FeatureCollection";
    features: Array<{ properties?: Record<string, unknown> }>;
  };
  routesGeo.features = routesGeo.features.filter((f) => f.properties?.feedId !== "up");
  routesGeo.features.push(...upRouteFeatures);
  writeFileSync(routesPath, JSON.stringify(routesGeo));

  const stopsPath = join(outDir, "stops.json");
  const stopsGeo = JSON.parse(readFileSync(stopsPath, "utf8")) as {
    type: "FeatureCollection";
    features: Array<{ properties?: Record<string, unknown> }>;
  };
  stopsGeo.features = stopsGeo.features.filter((f) => f.properties?.feedId !== "up");
  for (const s of upStops) {
    stopsGeo.features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: { groupId: `up-${s.stopId}`, name: s.name, feedId: "up" },
    });
  }
  writeFileSync(stopsPath, JSON.stringify(stopsGeo));

  const stopMetaPath = join(outDir, "stop-meta.json");
  const stopMeta = JSON.parse(readFileSync(stopMetaPath, "utf8")) as Record<
    string,
    Record<
      string,
      {
        locationType: number;
        parentStation: string | null;
        name: string;
        lat: number;
        lon: number;
      }
    >
  >;
  stopMeta.up = {};
  for await (const row of readCsv(join(upDir, "stops.txt"))) {
    const stopId = pick(row, "stop_id");
    if (!stopId) continue;
    stopMeta.up[stopId] = {
      locationType: Number(pick(row, "location_type") || 0),
      parentStation: pick(row, "parent_station") || null,
      name: pick(row, "stop_name"),
      lat: Number(pick(row, "stop_lat")),
      lon: Number(pick(row, "stop_lon")),
    };
  }
  writeFileSync(stopMetaPath, JSON.stringify(stopMeta));

  writeShardedRecord(outDir, "up-schedules", schedulesByStop);
  writeShardedRecord(outDir, "up-trip-stops", tripStops);

  console.log(
    `Merged UP Express: ${upStops.length} stops, ${routes.length} routes, ${upRouteFeatures.length} shapes`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
