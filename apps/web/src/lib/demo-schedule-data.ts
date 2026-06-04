import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveDemoDir } from "./demo-dir";
import { readDemoJsonFile } from "./demo-read";
import type { ScheduleRow, TripStopRow } from "./demo-schedule-types";

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

export async function loadUnionSchedule(): Promise<ScheduleRow[]> {
  if (unionCache) return unionCache;
  unionCache = await readDemoJsonFile<ScheduleRow[]>("union-schedule.json");
  return unionCache;
}
