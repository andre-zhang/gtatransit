import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gtfsTimeToSec, normalizeServiceSec, torontoNowSec, boardHorizonSec } from "./calendar";
import { resolveDemoDir } from "./demo-dir";
import { readDemoJsonFile } from "./demo-read";
import type { ScheduleRow, TripStopRow } from "./demo-schedule-types";
import { isDemoFixtureTripId } from "./demo-trip-id";
import { goScheduleLookupKeys, goTripSuffix, goTripsMatch } from "./go-stop-aliases";
import { routesMatch } from "./route-match";
import { filterRowsByServiceDate } from "./demo-calendar";

const scheduleCache = new Map<string, Record<string, ScheduleRow[]>>();
const tripStopCache = new Map<string, Record<string, TripStopRow[]>>();
let unionCache: ScheduleRow[] | null = null;

function shardNames(base: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${base}.${i}.json`);
}

/** Fallback shard names when shard-manifest.json is unavailable (keep in sync with reshard script output). */
const SHARD_MANIFEST: Record<string, string[]> = {
  "ttc-schedules": shardNames("ttc-schedules", 63),
  "ttc-trip-stops": shardNames("ttc-trip-stops", 73),
  "go-schedules": shardNames("go-schedules", 2),
  "go-trip-stops": shardNames("go-trip-stops", 2),
  "up-schedules": ["up-schedules.json"],
  "up-trip-stops": ["up-trip-stops.json"],
  "miway-schedules": shardNames("miway-schedules", 12),
  "miway-trip-stops": shardNames("miway-trip-stops", 13),
  "brampton-schedules": shardNames("brampton-schedules", 10),
  "brampton-trip-stops": shardNames("brampton-trip-stops", 12),
  "yrt-schedules": shardNames("yrt-schedules", 21),
  "yrt-trip-stops": shardNames("yrt-trip-stops", 25),
  "drt-schedules": shardNames("drt-schedules", 21),
  "drt-trip-stops": shardNames("drt-trip-stops", 22),
};

const shardIndexCache = new Map<string, Record<string, string>>();
const routeIndexCache = new Map<string, Record<string, string[]>>();
const shardFileCache = new Map<string, Record<string, TripStopRow[]>>();
const tripStopRowCache = new Map<string, TripStopRow[]>();
let runtimeShardManifest: Record<string, string[]> | null = null;
let manifestFetch: Promise<void> | null = null;

function loadRuntimeShardManifest(): Record<string, string[]> {
  if (runtimeShardManifest) return runtimeShardManifest;

  if (process.env.VERCEL) {
    // No filesystem on Vercel — hydrate from the static asset in the background.
    if (!manifestFetch) {
      manifestFetch = readDemoJsonFile<Record<string, string[]>>("shard-manifest.json")
        .then((m) => {
          runtimeShardManifest = m;
        })
        .catch(() => {
          runtimeShardManifest = SHARD_MANIFEST;
        });
    }
    return SHARD_MANIFEST;
  }

  try {
    const demoDir = resolveDemoDir();
    const raw = readFileSync(join(demoDir, "shard-manifest.json"), "utf8");
    runtimeShardManifest = JSON.parse(raw) as Record<string, string[]>;
    return runtimeShardManifest;
  } catch {
    runtimeShardManifest = SHARD_MANIFEST;
    return runtimeShardManifest;
  }
}

/** Prefer numbered shards; a monolith alongside numbered shards is stale build output. */
function preferNumberedShards(files: string[]): string[] {
  const numbered = files.filter((name) => /\.\d+\.json$/.test(name));
  return numbered.length ? numbered : files;
}

async function loadShardIndex(basename: string): Promise<Record<string, string>> {
  const hit = shardIndexCache.get(basename);
  if (hit) return hit;
  try {
    const idx = await readDemoJsonFile<Record<string, string>>(`${basename}-index.json`);
    shardIndexCache.set(basename, idx);
    return idx;
  } catch {
    const empty = {};
    shardIndexCache.set(basename, empty);
    return empty;
  }
}

function listShardFiles(basename: string): string[] {
  const manifest = loadRuntimeShardManifest();
  if (process.env.VERCEL) {
    return preferNumberedShards(manifest[basename] ?? SHARD_MANIFEST[basename] ?? []);
  }

  const demoDir = resolveDemoDir();
  if (!existsSync(demoDir)) {
    return preferNumberedShards(manifest[basename] ?? SHARD_MANIFEST[basename] ?? []);
  }
  const re = new RegExp(
    `^${basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.(\\d+))?\\.json$`,
  );
  const local = readdirSync(demoDir)
    .filter((name) => re.test(name))
    .sort((a, b) => {
      const idx = (n: string) => {
        const m = n.match(re);
        return m?.[1] !== undefined ? Number(m[1]) : -1;
      };
      return idx(a) - idx(b);
    });
  return preferNumberedShards(
    local.length ? local : (manifest[basename] ?? SHARD_MANIFEST[basename] ?? []),
  );
}

async function loadShardedRecord<T extends Record<string, unknown>>(
  basename: string,
): Promise<T> {
  const files = listShardFiles(basename);
  if (!files.length) {
    try {
      return await readDemoJsonFile<T>(`${basename}.json`);
    } catch {
      return {} as T;
    }
  }

  const merged = {} as T;
  for (const file of files) {
    const part = await readDemoJsonFile<Record<string, unknown>>(file);
    Object.assign(merged, part);
  }
  return merged;
}

export async function loadFeedSchedules(
  feedId: string,
): Promise<Record<string, ScheduleRow[]>> {
  const hit = scheduleCache.get(feedId);
  if (hit) return hit;
  const data = await loadShardedRecord<Record<string, ScheduleRow[]>>(
    `${feedId}-schedules`,
  );
  scheduleCache.set(feedId, data);
  return data;
}

const stopRowCache = new Map<string, ScheduleRow[]>();
const fullScheduleFileCache = new Map<string, Record<string, ScheduleRow[]>>();

async function loadFullScheduleFile(
  feedId: string,
): Promise<Record<string, ScheduleRow[]>> {
  const hit = fullScheduleFileCache.get(feedId);
  if (hit) return hit;
  try {
    const data = await readDemoJsonFile<Record<string, ScheduleRow[]>>(
      `${feedId}-schedules.json`,
    );
    fullScheduleFileCache.set(feedId, data);
    return data;
  } catch {
    const empty = {};
    fullScheduleFileCache.set(feedId, empty);
    return empty;
  }
}

async function loadStopScheduleRowsDirect(
  feedId: string,
  stopId: string,
): Promise<ScheduleRow[]> {
  const basename = `${feedId}-schedules`;
  const files = listShardFiles(basename);
  if (!files.length) {
    const data = await loadFullScheduleFile(feedId);
    return data[stopId] ?? [];
  }

  const index = await loadShardIndex(basename);
  const indexedFile = index[stopId];
  if (indexedFile) {
    try {
      const part = await readDemoJsonFile<Record<string, ScheduleRow[]>>(indexedFile);
      const rows = part[stopId] ?? [];
      if (rows.length) return rows;
    } catch {
      /* shard missing — fall through to scan */
    }
  }

  for (const file of files) {
    const part = await readDemoJsonFile<Record<string, ScheduleRow[]>>(file);
    const rows = part[stopId];
    if (rows?.length) return rows;
  }
  return [];
}

function cacheStopRows(feedId: string, keys: string[], rows: ScheduleRow[]) {
  for (const key of keys) stopRowCache.set(`${feedId}:${key}`, rows);
}

/** Load one stop's rows without merging every schedule shard into memory. */
export async function loadStopScheduleRows(
  feedId: string,
  stopId: string,
): Promise<ScheduleRow[]> {
  const lookupKeys =
    feedId === "go" ? goScheduleLookupKeys(stopId) : [stopId];

  for (const key of lookupKeys) {
    const cached = stopRowCache.get(`${feedId}:${key}`);
    if (cached) {
      const filtered = await filterRowsByServiceDate(feedId, cached);
      cacheStopRows(feedId, lookupKeys, filtered);
      return filtered;
    }
  }

  for (const key of lookupKeys) {
    const rows = await loadStopScheduleRowsDirect(feedId, key);
    if (rows.length) {
      const filtered = await filterRowsByServiceDate(feedId, rows);
      cacheStopRows(feedId, lookupKeys, filtered);
      return filtered;
    }
  }

  cacheStopRows(feedId, lookupKeys, []);
  return [];
}

/** routeId/routeShort -> schedule shard filenames containing that route. */
async function loadRouteShardIndex(
  feedId: string,
): Promise<Record<string, string[]>> {
  const basename = `${feedId}-schedules-route`;
  const hit = routeIndexCache.get(basename);
  if (hit) return hit;
  try {
    const idx = await readDemoJsonFile<Record<string, string[]>>(
      `${basename}-index.json`,
    );
    routeIndexCache.set(basename, idx);
    return idx;
  } catch {
    const empty = {};
    routeIndexCache.set(basename, empty);
    return empty;
  }
}

/** Collect rows for a route by scanning shards (stops early once enough trips found). */
export async function loadRouteScheduleRows(
  feedId: string,
  routeId: string,
): Promise<ScheduleRow[]> {
  const matches = (row: ScheduleRow) =>
    routesMatch(feedId, routeId, routeId, row.routeId) ||
    routesMatch(feedId, routeId, routeId, row.routeShort);

  let files = listShardFiles(`${feedId}-schedules`);
  if (!files.length) {
    try {
      const data = await readDemoJsonFile<Record<string, ScheduleRow[]>>(
        `${feedId}-schedules.json`,
      );
      const rows: ScheduleRow[] = [];
      for (const sched of Object.values(data)) {
        for (const row of sched) {
          if (matches(row)) rows.push(row);
        }
      }
      return filterRowsByServiceDate(feedId, rows);
    } catch {
      return [];
    }
  }

  // Narrow the scan to shards known to contain this route.
  const routeIndex = await loadRouteShardIndex(feedId);
  const indexed = new Set<string>();
  for (const [key, shardFiles] of Object.entries(routeIndex)) {
    if (routesMatch(feedId, routeId, routeId, key)) {
      for (const f of shardFiles) indexed.add(f);
    }
  }
  if (indexed.size) files = files.filter((f) => indexed.has(f));

  const byTrip = new Map<string, ScheduleRow>();

  for (const file of files) {
    const part = await readDemoJsonFile<Record<string, ScheduleRow[]>>(file);
    for (const sched of Object.values(part)) {
      for (const row of sched) {
        if (!matches(row)) continue;
        const prev = byTrip.get(row.tripId);
        if (!prev || row.departureTime < prev.departureTime) {
          byTrip.set(row.tripId, row);
        }
      }
    }
  }

  const sorted = [...byTrip.values()].sort((a, b) =>
    a.departureTime.localeCompare(b.departureTime),
  );
  return filterRowsByServiceDate(feedId, sorted);
}

/** tripId -> schedule shard filename (built by scripts/reshard-schedules.mjs). */
async function loadTripShardIndex(feedId: string): Promise<Record<string, string>> {
  return loadShardIndex(`${feedId}-schedules-trip`);
}

function findTripInShard(
  part: Record<string, ScheduleRow[]>,
  feedId: string,
  tripId: string,
): ScheduleRow | undefined {
  let suffixHit: ScheduleRow | undefined;
  for (const sched of Object.values(part)) {
    const hit = sched.find((row) => row.tripId === tripId);
    if (hit) return hit;
    if (!suffixHit && (feedId === "go" || feedId === "up")) {
      suffixHit = sched.find((row) => goTripsMatch(row.tripId, tripId));
    }
  }
  return suffixHit;
}

/** Find a single trip without loading and retaining every schedule shard. */
export async function lookupTripScheduleRow(
  feedId: string,
  tripId: string,
): Promise<ScheduleRow | undefined> {
  if (!isDemoFixtureTripId(feedId, tripId)) return undefined;

  const files = listShardFiles(`${feedId}-schedules`);
  if (!files.length) {
    try {
      const data = await readDemoJsonFile<Record<string, ScheduleRow[]>>(
        `${feedId}-schedules.json`,
      );
      return findTripInShard(data, feedId, tripId);
    } catch {
      return undefined;
    }
  }

  const tripIndex = await loadTripShardIndex(feedId);
  let indexedFile = tripIndex[tripId];
  if (!indexedFile && (feedId === "go" || feedId === "up")) {
    const suffix = goTripSuffix(tripId);
    for (const [key, file] of Object.entries(tripIndex)) {
      if (goTripSuffix(key) === suffix) {
        indexedFile = file;
        break;
      }
    }
  }
  if (indexedFile) {
    try {
      const part = await readDemoJsonFile<Record<string, ScheduleRow[]>>(indexedFile);
      const hit = findTripInShard(part, feedId, tripId);
      if (hit) return hit;
    } catch {
      /* shard missing — fall through to scan */
    }
  }
  if (Object.keys(tripIndex).length) return undefined;

  for (const file of files) {
    const part = await readDemoJsonFile<Record<string, ScheduleRow[]>>(file);
    const hit = findTripInShard(part, feedId, tripId);
    if (hit) return hit;
  }
  return undefined;
}

export async function loadFeedTripStops(
  feedId: string,
): Promise<Record<string, TripStopRow[]>> {
  const hit = tripStopCache.get(feedId);
  if (hit) return hit;
  const data = await loadShardedRecord<Record<string, TripStopRow[]>>(
    `${feedId}-trip-stops`,
  );
  tripStopCache.set(feedId, data);
  return data;
}

async function readTripStopShard(file: string): Promise<Record<string, TripStopRow[]>> {
  const hit = shardFileCache.get(file);
  if (hit) return hit;
  const part = await readDemoJsonFile<Record<string, TripStopRow[]>>(file);
  shardFileCache.set(file, part);
  return part;
}

/** Load one trip's stop list without merging every trip-stop shard. */
export async function loadTripStopsForTrip(
  feedId: string,
  tripId: string,
): Promise<TripStopRow[]> {
  const rowKey = `${feedId}:${tripId}`;
  const rowHit = tripStopRowCache.get(rowKey);
  if (rowHit) return rowHit;

  const files = listShardFiles(`${feedId}-trip-stops`);
  if (!files.length) {
    try {
      const data = await readDemoJsonFile<Record<string, TripStopRow[]>>(
        `${feedId}-trip-stops.json`,
      );
      const rows = data[tripId] ?? [];
      tripStopRowCache.set(rowKey, rows);
      return rows;
    } catch {
      tripStopRowCache.set(rowKey, []);
      return [];
    }
  }

  const basename = `${feedId}-trip-stops`;
  const index = await loadShardIndex(basename);
  const indexedFile = index[tripId];
  if (indexedFile) {
    const part = await readTripStopShard(indexedFile);
    const rows = part[tripId] ?? [];
    tripStopRowCache.set(rowKey, rows);
    return rows;
  }

  if (feedId === "go") {
    const suffix = goTripSuffix(tripId);
    for (const [key, file] of Object.entries(index)) {
      if (goTripSuffix(key) !== suffix) continue;
      const part = await readTripStopShard(file);
      const rows = part[key];
      if (rows?.length) {
        tripStopRowCache.set(rowKey, rows);
        return rows;
      }
    }
  }

  for (const file of files) {
    const part = await readTripStopShard(file);
    const rows = part[tripId];
    if (rows?.length) {
      tripStopRowCache.set(rowKey, rows);
      return rows;
    }
  }
  tripStopRowCache.set(rowKey, []);
  return [];
}

export async function loadUnionSchedule(): Promise<ScheduleRow[]> {
  if (unionCache) return unionCache;
  unionCache = await readDemoJsonFile<ScheduleRow[]>("union-schedule.json");
  return unionCache;
}

/** Trim the union hub schedule to upcoming board rows (avoids scanning 5k+ rows per request). */
export async function loadUnionScheduleForBoard(
  members: Array<{ feedId: string; stopId: string }>,
  maxRows = 250,
): Promise<ScheduleRow[]> {
  const union = await loadUnionSchedule();
  const keys = new Set(members.map((m) => `${m.feedId}:${m.stopId}`));
  const now = torontoNowSec();
  const pastGrace = 120;
  const horizon = boardHorizonSec(now);
  return union
    .filter((r) => keys.has(`${r.feedId}:${r.stopId}`))
    .map((row) => ({
      row,
      sec: normalizeServiceSec(gtfsTimeToSec(row.departureTime), now),
    }))
    .filter(({ sec }) => sec >= now - pastGrace && sec <= now + horizon)
    .sort((a, b) => a.sec - b.sec)
    .slice(0, maxRows)
    .map(({ row }) => row);
}
