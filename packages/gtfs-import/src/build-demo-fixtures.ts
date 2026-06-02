/**
 * Builds apps/web/demo/fixtures.json from downloaded GTFS zips (routes + shapes).
 * Run after fetch-gtfs — no database required.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";
import "dotenv/config";
import { pick, readCsv } from "./csv.js";
import { routeIdFromRow } from "./route-id.js";
import { buildUnionDepartures } from "./build-union-departures.js";
import {
  buildFeedSchedules,
  loadGoStops,
  loadTtcSubwayStops,
} from "./build-demo-stops.js";
import { decimateLine } from "./simplify-line.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const dataDir = process.env.GTFS_DATA_DIR ?? join(root, "data/gtfs");
const outDir = join(root, "apps/web/demo");
const outPath = join(outDir, "fixtures.json");

const FEEDS: Array<{ id: string; name: string; zip: string }> = [
  { id: "ttc", name: "TTC", zip: "ttc.zip" },
  { id: "go", name: "GO Transit", zip: "go.zip" },
  { id: "miway", name: "MiWay", zip: "miway.zip" },
  { id: "brampton", name: "Brampton Transit", zip: "brampton.zip" },
  { id: "drt", name: "Durham Region Transit", zip: "drt.zip" },
];

const MODE_LABELS: Record<number, string> = {
  0: "Streetcar",
  1: "Subway",
  2: "Rail",
  3: "Bus",
  4: "Ferry",
  7: "Ferry",
};

const AGENCY_COLORS: Record<string, string> = {
  ttc: "#da291c",
  go: "#007934",
  yrt: "#0072ce",
  brampton: "#e87722",
  drt: "#003da5",
  miway: "#00a651",
};

const TORONTO_UNION_ID = "toronto-union";

const GO_LINE: Record<string, string> = {
  "01": "#e57200",
  "02": "#00843d",
  "03": "#ffd100",
  "04": "#0080c0",
  "05": "#0080c0",
  "06": "#8b008b",
  "07": "#c8102e",
};

function routeColor(feedId: string, shortName: string | null, routeColor?: string | null): string {
  if (routeColor) return `#${routeColor.replace(/^#/, "")}`;
  if (feedId === "go" && shortName) {
    const c = GO_LINE[shortName.padStart(2, "0")];
    if (c) return c;
  }
  return AGENCY_COLORS[feedId] ?? "#007934";
}

async function extractZip(zipPath: string, outDir: string): Promise<string | null> {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  await pipeline(createReadStream(zipPath), unzipper.Extract({ path: outDir }));
  function find(dir: string): string | null {
    if (existsSync(join(dir, "routes.txt"))) return dir;
    for (const name of readdirSync(dir)) {
      const f = find(join(dir, name));
      if (f) return f;
    }
    return null;
  }
  return find(outDir);
}

async function loadFeed(feedId: string, name: string, zipName: string) {
  const zipPath = join(dataDir, zipName);
  if (!existsSync(zipPath)) {
    console.warn(`Skip ${feedId}: missing ${zipPath}`);
    return null;
  }
  const extractDir = join(dataDir, "extracted-demo", feedId);
  const dir = await extractZip(zipPath, extractDir);
  if (!dir) return null;

  const routes: Array<{
    id: string;
    shortName: string | null;
    longName: string | null;
    routeType: number;
    color: string;
  }> = [];

  const routeById = new Map<string, (typeof routes)[0]>();
  for await (const row of readCsv(join(dir, "routes.txt"))) {
    const id = routeIdFromRow(row);
    if (!id || routeById.has(id)) continue;
    routeById.set(id, {
      id,
      shortName: pick(row, "route_short_name") || null,
      longName: pick(row, "route_long_name") || null,
      routeType: Number(pick(row, "route_type") || 3),
      color: routeColor(feedId, pick(row, "route_short_name"), pick(row, "route_color") || null),
    });
  }
  routes.push(...routeById.values());

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
  const shapesPath = join(dir, "shapes.txt");
  if (existsSync(shapesPath)) {
    for await (const row of readCsv(shapesPath)) {
      const sid = pick(row, "shape_id");
      if (!sid) continue;
      if (!shapePoints.has(sid)) shapePoints.set(sid, []);
      shapePoints.get(sid)!.push({
        lat: Number(pick(row, "shape_pt_lat")),
        lon: Number(pick(row, "shape_pt_lon")),
        seq: Number(pick(row, "shape_pt_sequence")),
      });
    }
  }

  const routeTypeById = new Map(routes.map((r) => [r.id, r.routeType]));
  const routeShape = new Map<string, Map<number, number[][]>>();
  let shapeFeatures = 0;
  let busShapes = 0;
  const MAX_SHAPES = 500;

  const sortedTrips = [...tripRoute.entries()].sort((a, b) => {
    const rtA = routeTypeById.get(a[1].routeId) ?? 3;
    const rtB = routeTypeById.get(b[1].routeId) ?? 3;
    if (rtA === 2 && rtB !== 2) return -1;
    if (rtB === 2 && rtA !== 2) return 1;
    return 0;
  });

  for (const [tripId, { routeId, direction }] of sortedTrips) {
    const rt = routeTypeById.get(routeId) ?? 3;
    if (rt === 3) {
      if (busShapes >= 80) continue;
    } else if (rt !== 2 && shapeFeatures >= MAX_SHAPES) {
      continue;
    }

    const sid = tripShape.get(tripId);
    if (!sid || !shapePoints.has(sid)) continue;
    const existing = routeShape.get(routeId);
    if (existing?.has(direction)) continue;

    const pts = shapePoints.get(sid)!.sort((a, b) => a.seq - b.seq);
    if (pts.length < 2) continue;
    let coords = pts.map((p) => [p.lon, p.lat]);
    if (rt === 3) {
      coords = decimateLine(coords, 120);
      busShapes++;
    }
    if (!routeShape.has(routeId)) routeShape.set(routeId, new Map());
    routeShape.get(routeId)!.set(direction, coords);
    shapeFeatures++;
  }

  const features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: number[][] };
    properties: Record<string, unknown>;
  }> = [];

  for (const [routeId, dirs] of routeShape) {
    const r = routes.find((x) => x.id === routeId);
    if (!r) continue;
    let bestDir = 0;
    let bestCoords: number[][] = [];
    for (const [directionId, coords] of dirs) {
      if (coords.length > bestCoords.length) {
        bestCoords = coords;
        bestDir = directionId;
      }
    }
    if (bestCoords.length < 2) continue;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: bestCoords },
      properties: {
        feedId,
        routeId,
        routeShort: r.shortName,
        directionId: bestDir,
        routeType: r.routeType,
        color: r.color,
      },
    });
  }

  const modeMap = new Map<number, typeof routes>();
  for (const r of routes) {
    if (!modeMap.has(r.routeType)) modeMap.set(r.routeType, []);
    modeMap.get(r.routeType)!.push(r);
  }

  const modes = [...modeMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([type, rs]) => ({
      type,
      label: MODE_LABELS[type] ?? `Mode ${type}`,
      routes: rs
        .sort((a, b) => (a.shortName ?? a.id).localeCompare(b.shortName ?? b.id, undefined, { numeric: true }))
        .map((r) => ({
          id: r.id,
          shortName: r.shortName,
          longName: r.longName,
        })),
    }));

  console.log(`${feedId}: ${routes.length} routes, ${features.length} shape features`);
  return { id: feedId, name, modes, features, gtfsDir: dir };
}

async function main() {
  const agencies: Array<{
    id: string;
    name: string;
    modes: Array<{
      type: number;
      label: string;
      routes: Array<{ id: string; shortName: string | null; longName: string | null }>;
    }>;
  }> = [];

  type Feature = {
    type: "Feature";
    geometry: { type: "LineString"; coordinates: number[][] };
    properties: Record<string, unknown>;
  };
  const features: Feature[] = [];
  const feedDirs: Array<{ feedId: string; dir: string }> = [];

  for (const f of FEEDS) {
    const loaded = await loadFeed(f.id, f.name, f.zip);
    if (!loaded) continue;
    agencies.push({ id: loaded.id, name: loaded.name, modes: loaded.modes });
    features.push(...(loaded.features as Feature[]));
    feedDirs.push({ feedId: loaded.id, dir: loaded.gtfsDir });
  }

  const yrtZip = process.env.YRT_GTFS_ZIP;
  if (yrtZip && existsSync(yrtZip)) {
    const yrtDir = join(dataDir, "extracted-demo", "yrt");
    mkdirSync(dirname(yrtDir), { recursive: true });
    const yrtCopy = join(dataDir, "yrt.zip");
    if (!existsSync(yrtCopy)) copyFileSync(yrtZip, yrtCopy);
    const loaded = await loadFeed("yrt", "YRT / Viva", "yrt.zip");
    if (loaded) {
      agencies.push({ id: loaded.id, name: loaded.name, modes: loaded.modes });
      features.push(...(loaded.features as Feature[]));
      feedDirs.push({ feedId: loaded.id, dir: loaded.gtfsDir });
    }
  }

  console.log("Building stop data & schedules…");
  const unionSchedule = await buildUnionDepartures(feedDirs);
  console.log(`Union area departures (TTC/MiWay): ${unionSchedule.length} trips`);

  const stopRegistry: Record<
    string,
    { name: string; members: Array<{ feedId: string; stopId: string }> }
  > = {};
  const stopFeatures: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, unknown>;
  }> = [];

  let goSchedules: Record<string, unknown> = {};
  let goTripStops: Record<string, unknown> = {};

  const goFeed = feedDirs.find((f) => f.feedId === "go");
  if (goFeed) {
    console.log("Indexing GO stop_times (one-time, may take a few minutes)…");
    const goStops = await loadGoStops(goFeed.dir);
    const stopIds = new Set(goStops.map((s) => s.stopId));
    const built = await buildFeedSchedules("go", goFeed.dir, stopIds);
    goSchedules = built.schedulesByStop;
    goTripStops = built.tripStops;
    for (const s of goStops) {
      const groupId = `go-${s.stopId}`;
      stopRegistry[groupId] = {
        name: s.name,
        members: [{ feedId: "go", stopId: s.stopId }],
      };
      stopFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: { groupId, name: s.name, feedId: "go" },
      });
    }
    console.log(`GO: ${goStops.length} stops, ${Object.keys(goSchedules).length} with schedules`);
  }

  const ttcFeed = feedDirs.find((f) => f.feedId === "ttc");
  const unionMembers: Array<{ feedId: string; stopId: string }> = [
    { feedId: "go", stopId: "UN" },
  ];
  if (ttcFeed) {
    const subway = await loadTtcSubwayStops(ttcFeed.dir);
    for (const s of subway) {
      const groupId = `ttc-${s.stopId}`;
      stopRegistry[groupId] = {
        name: s.name,
        members: [{ feedId: "ttc", stopId: s.stopId }],
      };
      stopFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: { groupId, name: s.name, feedId: "ttc" },
      });
    }
    for (const row of unionSchedule) {
      if (row.feedId === "ttc" && !unionMembers.some((m) => m.stopId === row.stopId)) {
        unionMembers.push({ feedId: "ttc", stopId: row.stopId });
      }
    }
  }
  for (const row of unionSchedule) {
    if (
      row.feedId === "miway" &&
      !unionMembers.some((m) => m.feedId === "miway" && m.stopId === row.stopId)
    ) {
      unionMembers.push({ feedId: "miway", stopId: row.stopId });
    }
  }

  stopRegistry[TORONTO_UNION_ID] = { name: "Toronto Union", members: unionMembers };
  if (!stopFeatures.some((f) => f.properties.groupId === TORONTO_UNION_ID)) {
    stopFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [-79.3806, 43.6453] },
      properties: { groupId: TORONTO_UNION_ID, name: "Toronto Union", feedId: "go" },
    });
  }

  mkdirSync(outDir, { recursive: true });

  const core = {
    rtUpdated: new Date().toISOString(),
    filterTree: { agencies },
    vehiclesGeoJson: { type: "FeatureCollection", features: [] },
    stops: stopRegistry,
    runs: {},
    routes: {},
  };

  writeFileSync(outPath, JSON.stringify(core));
  writeFileSync(join(outDir, "routes.json"), JSON.stringify({ type: "FeatureCollection", features }));
  writeFileSync(join(outDir, "stops.json"), JSON.stringify({ type: "FeatureCollection", features: stopFeatures }));
  writeFileSync(join(outDir, "go-schedules.json"), JSON.stringify(goSchedules));
  writeFileSync(join(outDir, "go-trip-stops.json"), JSON.stringify(goTripStops));
  writeFileSync(join(outDir, "union-schedule.json"), JSON.stringify(unionSchedule));

  console.log(`Wrote ${outDir} (${agencies.length} agencies, ${features.length} routes, ${stopFeatures.length} stops)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
