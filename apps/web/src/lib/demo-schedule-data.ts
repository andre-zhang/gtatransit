import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveDemoDir } from "./demo-dir";
import { readDemoJsonFile } from "./demo-read";
import type { ScheduleRow, TripStopRow } from "./demo-schedule-types";
import { isDemoFixtureTripId } from "./demo-trip-id";
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
};

function listShardFiles(basename: string): string[] {
  if (process.env.VERCEL) return SHARD_MANIFEST[basename] ?? [];

  const demoDir = resolveDemoDir();
  if (!existsSync(demoDir)) return SHARD_MANIFEST[basename] ?? [];
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
  return local.length ? local : (SHARD_MANIFEST[basename] ?? []);
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

/** Load one stop's rows without merging every schedule shard into memory. */
export async function loadStopScheduleRows(
  feedId: string,
  stopId: string,
): Promise<ScheduleRow[]> {
  const cacheKey = `${feedId}:${stopId}`;
  const cached = stopRowCache.get(cacheKey);
  if (cached) return cached;

  const files = listShardFiles(`${feedId}-schedules`);
  if (!files.length) {
    try {
      const data = await readDemoJsonFile<Record<string, ScheduleRow[]>>(
        `${feedId}-schedules.json`,
      );
      return data[stopId] ?? [];
    } catch {
      return [];
    }
  }

  for (const file of files) {
    const part = await readDemoJsonFile<Record<string, ScheduleRow[]>>(file);
    const rows = part[stopId];
    if (rows?.length) {
      stopRowCache.set(cacheKey, rows);
      return rows;
    }
  }
  stopRowCache.set(cacheKey, []);
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
