/**
 * Append TTC subway + Line 5/6 LRT schedules from the full merged GTFS feed
 * into existing demo fixtures (surface GTFS stays for RT alignment).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { pick, readCsv } from "./csv.js";
import { routeIdFromRow } from "./route-id.js";
import {
  buildFeedSchedules,
  loadTtcRapidTransitStops,
} from "./build-demo-stops.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const dataDir = process.env.GTFS_DATA_DIR ?? join(root, "data/gtfs");
const outDir = join(root, "apps/web/public/demo");
const fullDir = join(dataDir, "extracted-demo", "ttc-full");
const TORONTO_UNION_ID = "toronto-union";

const RAPID_ROUTE_IDS = new Set(["1", "2", "4", "5", "6"]);

function nextShardIndex(basename: string): number {
  const re = new RegExp(
    `^${basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)\\.json$`,
  );
  let max = -1;
  for (const name of readdirSync(outDir)) {
    const m = name.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function routeColor(shortName: string | null, hex?: string | null): string {
  if (hex) return `#${hex.replace(/^#/, "")}`;
  const subway: Record<string, string> = {
    "1": "#D5C82B",
    "2": "#008000",
    "4": "#B300B3",
    "5": "#FF8000",
    "6": "#808080",
  };
  if (shortName && subway[shortName]) return subway[shortName]!;
  return "#da291c";
}

async function loadStopMeta(dir: string) {
  const meta: Record<
    string,
    {
      locationType: number;
      parentStation: string | null;
      name: string;
      lat: number;
      lon: number;
    }
  > = {};
  for await (const row of readCsv(join(dir, "stops.txt"))) {
    const stopId = pick(row, "stop_id");
    if (!stopId) continue;
    meta[stopId] = {
      locationType: Number(pick(row, "location_type") || 0),
      parentStation: pick(row, "parent_station") || null,
      name: pick(row, "stop_name"),
      lat: Number(pick(row, "stop_lat")),
      lon: Number(pick(row, "stop_lon")),
    };
  }
  return meta;
}

async function main() {
  if (!existsSync(join(fullDir, "routes.txt"))) {
    console.error(`Missing full TTC GTFS at ${fullDir} — download ttc-full.zip first`);
    process.exit(1);
  }

  console.log("Loading TTC rapid transit stops from full GTFS…");
  const rapidStops = await loadTtcRapidTransitStops(fullDir);
  const stopIds = new Set(rapidStops.map((s) => s.stopId));
  console.log(`Found ${rapidStops.length} rapid transit platform stops`);

  console.log("Building schedules…");
  const built = await buildFeedSchedules("ttc", fullDir, stopIds);
  const newScheduleKeys = Object.keys(built.schedulesByStop).length;
  const newTripKeys = Object.keys(built.tripStops).length;
  console.log(`Built ${newScheduleKeys} stop schedule keys, ${newTripKeys} trips`);

  const schedShard = nextShardIndex("ttc-schedules");
  const tripShard = nextShardIndex("ttc-trip-stops");
  const schedFile = `ttc-schedules.${schedShard}.json`;
  const tripFile = `ttc-trip-stops.${tripShard}.json`;
  writeFileSync(join(outDir, schedFile), JSON.stringify(built.schedulesByStop));
  writeFileSync(join(outDir, tripFile), JSON.stringify(built.tripStops));
  console.log(`Wrote ${schedFile} and ${tripFile}`);

  const fullMeta = await loadStopMeta(fullDir);
  const stopMetaPath = join(outDir, "stop-meta.json");
  const stopMeta = JSON.parse(readFileSync(stopMetaPath, "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  if (!stopMeta.ttc) stopMeta.ttc = {};
  for (const s of rapidStops) {
    const m = fullMeta[s.stopId];
    if (m) stopMeta.ttc[s.stopId] = m;
  }
  writeFileSync(stopMetaPath, JSON.stringify(stopMeta));

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

  const ttcAgency = fixtures.filterTree.agencies.find((a) => a.id === "ttc");
  if (ttcAgency) {
    const rapidRoutes: Array<{
      id: string;
      shortName: string | null;
      longName: string | null;
      routeType: number;
    }> = [];
    for await (const row of readCsv(join(fullDir, "routes.txt"))) {
      const id = routeIdFromRow(row);
      if (!id || !RAPID_ROUTE_IDS.has(id)) continue;
      rapidRoutes.push({
        id,
        shortName: pick(row, "route_short_name") || null,
        longName: pick(row, "route_long_name") || null,
        routeType: Number(pick(row, "route_type") || 1),
      });
    }

    let subwayMode = ttcAgency.modes.find((m) => m.type === 1);
    if (!subwayMode) {
      subwayMode = { type: 1, label: "Subway", routes: [] };
      ttcAgency.modes.unshift(subwayMode);
    }
    subwayMode.routes = rapidRoutes
      .filter((r) => r.routeType === 1)
      .map((r) => ({ id: r.id, shortName: r.shortName, longName: r.longName }));

    let lrtMode = ttcAgency.modes.find((m) => m.label === "LRT");
    if (!lrtMode) {
      lrtMode = { type: 0, label: "LRT", routes: [] };
      const streetcarIdx = ttcAgency.modes.findIndex(
        (m) => m.type === 0 && m.label === "Streetcar",
      );
      if (streetcarIdx >= 0) ttcAgency.modes.splice(streetcarIdx, 0, lrtMode);
      else ttcAgency.modes.unshift(lrtMode);
    }
    lrtMode.routes = rapidRoutes
      .filter((r) => r.routeType === 0)
      .map((r) => ({ id: r.id, shortName: r.shortName, longName: r.longName }));
  }

  const union = fixtures.stops[TORONTO_UNION_ID];
  for (const s of rapidStops) {
    const groupId = `ttc-${s.stopId}`;
    if (!fixtures.stops[groupId]) {
      fixtures.stops[groupId] = {
        name: s.name,
        members: [{ feedId: "ttc", stopId: s.stopId }],
      };
    }
    if (union && !union.members.some((m) => m.feedId === "ttc" && m.stopId === s.stopId)) {
      if (/union|yonge.*bloor|bloor.*yonge/i.test(s.name)) {
        union.members.push({ feedId: "ttc", stopId: s.stopId });
      }
    }
  }
  writeFileSync(fixturesPath, JSON.stringify(fixtures));

  const stopsPath = join(outDir, "stops.json");
  const stopsGeo = JSON.parse(readFileSync(stopsPath, "utf8")) as {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: "Point"; coordinates: [number, number] };
      properties: Record<string, unknown>;
    }>;
  };
  const existingIds = new Set(
    stopsGeo.features.map((f) => String(f.properties.groupId ?? "")),
  );
  for (const s of rapidStops) {
    const groupId = `ttc-${s.stopId}`;
    if (existingIds.has(groupId)) continue;
    stopsGeo.features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: { groupId, name: s.name, feedId: "ttc" },
    });
  }
  writeFileSync(stopsPath, JSON.stringify(stopsGeo));

  const routesPath = join(outDir, "routes.json");
  const routesGeo = JSON.parse(readFileSync(routesPath, "utf8")) as {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: "LineString"; coordinates: number[][] };
      properties: Record<string, unknown>;
    }>;
  };
  const existingRouteKeys = new Set(
    routesGeo.features.map(
      (f) => `${f.properties.feedId}:${f.properties.routeId}:${f.properties.directionId}`,
    ),
  );

  const tripShape = new Map<string, string>();
  for await (const row of readCsv(join(fullDir, "trips.txt"))) {
    const tid = pick(row, "trip_id");
    const sid = pick(row, "shape_id");
    if (tid && sid) tripShape.set(tid, sid);
  }
  const tripRoute = new Map<string, { routeId: string; direction: number }>();
  for await (const row of readCsv(join(fullDir, "trips.txt"))) {
    tripRoute.set(pick(row, "trip_id"), {
      routeId: pick(row, "route_id"),
      direction: Number(pick(row, "direction_id") || 0),
    });
  }
  const routeMeta = new Map<
    string,
    { shortName: string | null; routeType: number; color: string }
  >();
  for await (const row of readCsv(join(fullDir, "routes.txt"))) {
    const id = routeIdFromRow(row);
    if (!id || !RAPID_ROUTE_IDS.has(id)) continue;
    routeMeta.set(id, {
      shortName: pick(row, "route_short_name") || null,
      routeType: Number(pick(row, "route_type") || 1),
      color: routeColor(
        pick(row, "route_short_name") || null,
        pick(row, "route_color") || null,
      ),
    });
  }
  const shapePoints = new Map<string, Array<{ lat: number; lon: number; seq: number }>>();
  for await (const row of readCsv(join(fullDir, "shapes.txt"))) {
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
    if (!RAPID_ROUTE_IDS.has(routeId)) continue;
    const existing = routeShape.get(routeId);
    if (existing?.has(direction)) continue;
    const sid = tripShape.get(tripId);
    if (!sid || !shapePoints.has(sid)) continue;
    const pts = shapePoints.get(sid)!.sort((a, b) => a.seq - b.seq);
    if (pts.length < 2) continue;
    const coords = pts.map((p) => [p.lon, p.lat]);
    if (!routeShape.has(routeId)) routeShape.set(routeId, new Map());
    routeShape.get(routeId)!.set(direction, coords);
  }
  for (const [routeId, dirs] of routeShape) {
    const r = routeMeta.get(routeId);
    if (!r) continue;
    for (const [directionId, coords] of dirs) {
      const key = `ttc:${routeId}:${directionId}`;
      if (existingRouteKeys.has(key)) continue;
      routesGeo.features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          feedId: "ttc",
          routeId,
          routeShort: r.shortName,
          directionId,
          routeType: r.routeType,
          color: r.color,
        },
      });
    }
  }
  writeFileSync(routesPath, JSON.stringify(routesGeo));

  console.log(
    `Done — appended ${newScheduleKeys} rapid transit stops. Run: node scripts/demo-shard-index.mjs`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
