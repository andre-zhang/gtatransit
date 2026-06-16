import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gtfsTimeToSec, normalizeServiceSec, torontoNowSec } from "./calendar";
import { resolveDemoDir } from "./demo-dir";
import { readDemoJsonFile } from "./demo-read";
import type { ScheduleRow, TripStopRow } from "./demo-schedule-types";
import { isDemoFixtureTripId } from "./demo-trip-id";
import { goScheduleLookupKeys, goTripSuffix } from "./go-stop-aliases";
import { routesMatch } from "./route-match";

const scheduleCache = new Map<string, Record<string, ScheduleRow[]>>();
const tripStopCache = new Map<string, Record<string, TripStopRow[]>>();
let unionCache: ScheduleRow[] | null = null;

/** Known shard names (Vercel has no directory listing for public/demo). */
const SHARD_MANIFEST: Record<string, string[]> = {
  "ttc-schedules": [
    "ttc-schedules.0.json",
    "ttc-schedules.1.json",
    "ttc-schedules.2.json",
  ],
  "ttc-trip-stops": ["ttc-trip-stops.0.json", "ttc-trip-stops.1.json"],
  "go-schedules": ["go-schedules.0.json", "go-schedules.1.json"],
  "go-trip-stops": ["go-trip-stops.json"],
  "miway-schedules": [
    "miway-schedules.0.json",
    "miway-schedules.1.json",
    "miway-schedules.2.json",
    "miway-schedules.3.json",
    "miway-schedules.4.json",
    "miway-schedules.5.json",
  ],
  "miway-trip-stops": [
    "miway-trip-stops.0.json",
    "miway-trip-stops.1.json",
    "miway-trip-stops.2.json",
    "miway-trip-stops.3.json",
  ],
};

const shardIndexCache = new Map<string, Record<string, string>>();
let runtimeShardManifest: Record<string, string[]> | null = null;

function loadRuntimeShardManifest(): Record<string, string[]> {
  if (runtimeShardManifest) return runtimeShardManifest;
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
  if (process.env.VERCEL) return manifest[basename] ?? SHARD_MANIFEST[basename] ?? [];

  const demoDir = resolveDemoDir();
  if (!existsSync(demoDir)) return manifest[basename] ?? SHARD_MANIFEST[basename] ?? [];
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
  return local.length ? local : (manifest[basename] ?? SHARD_MANIFEST[basename] ?? []);
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
    const part = await readDemoJsonFile<Record<string, ScheduleRow[]>>(indexedFile);
    return part[stopId] ?? [];
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
    if (cached?.length) {
      cacheStopRows(feedId, lookupKeys, cached);
      return cached;
    }
  }

  for (const key of lookupKeys) {
    const rows = await loadStopScheduleRowsDirect(feedId, key);
    if (rows.length) {
      cacheStopRows(feedId, lookupKeys, rows);
      return rows;
    }
  }

  cacheStopRows(feedId, lookupKeys, []);
  return [];
}

/** Collect rows for a route by scanning shards (stops early once enough trips found). */
export async function loadRouteScheduleRows(
  feedId: string,
  routeId: string,
): Promise<ScheduleRow[]> {
  const matches = (row: ScheduleRow) =>
    routesMatch(feedId, routeId, routeId, row.routeId) ||
    routesMatch(feedId, routeId, routeId, row.routeShort);

  const files = listShardFiles(`${feedId}-schedules`);
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
      return rows;
    } catch {
      return [];
    }
  }

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

  return [...byTrip.values()].sort((a, b) =>
    a.departureTime.localeCompare(b.departureTime),
  );
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
      for (const sched of Object.values(data)) {
        const hit = sched.find((row) => row.tripId === tripId);
        if (hit) return hit;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  for (const file of files) {
    const part = await readDemoJsonFile<Record<string, ScheduleRow[]>>(file);
    for (const sched of Object.values(part)) {
      const hit = sched.find((row) => row.tripId === tripId);
      if (hit) return hit;
    }
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

/** Load one trip's stop list without merging every trip-stop shard. */
export async function loadTripStopsForTrip(
  feedId: string,
  tripId: string,
): Promise<TripStopRow[]> {
  const files = listShardFiles(`${feedId}-trip-stops`);
  if (!files.length) {
    try {
      const data = await readDemoJsonFile<Record<string, TripStopRow[]>>(
        `${feedId}-trip-stops.json`,
      );
      return data[tripId] ?? [];
    } catch {
      return [];
    }
  }

  const basename = `${feedId}-trip-stops`;
  const index = await loadShardIndex(basename);
  const indexedFile = index[tripId];
  if (indexedFile) {
    const part = await readDemoJsonFile<Record<string, TripStopRow[]>>(indexedFile);
    return part[tripId] ?? [];
  }

  if (feedId === "go") {
    const suffix = goTripSuffix(tripId);
    for (const [key, file] of Object.entries(index)) {
      if (goTripSuffix(key) !== suffix) continue;
      const part = await readDemoJsonFile<Record<string, TripStopRow[]>>(file);
      const rows = part[key];
      if (rows?.length) return rows;
    }
  }

  for (const file of files) {
    const part = await readDemoJsonFile<Record<string, TripStopRow[]>>(file);
    const rows = part[tripId];
    if (rows?.length) return rows;
  }
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
  const horizon = 2 * 3600;
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
