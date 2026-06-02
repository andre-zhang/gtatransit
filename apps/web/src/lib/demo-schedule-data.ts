import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ScheduleRow, TripStopRow } from "./demo-schedule-types";

const demoDir = join(process.cwd(), "demo");

const scheduleCache = new Map<string, Record<string, ScheduleRow[]>>();
const tripStopCache = new Map<string, Record<string, TripStopRow[]>>();
let unionCache: ScheduleRow[] | null = null;

function isGitLfsPointer(text: string): boolean {
  return text.startsWith("version https://git-lfs.github.com/spec/v1");
}

function readDemoJson<T>(filename: string, fallback: T): T {
  const path = join(demoDir, filename);
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, "utf8");
  if (isGitLfsPointer(raw)) {
    console.warn(
      `[demo] ${filename} is a Git LFS pointer — enable Git LFS on Vercel or use sharded demo JSON`,
    );
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[demo] Failed to parse ${filename}:`, e);
    return fallback;
  }
}

function listShardFiles(basename: string): string[] {
  if (!existsSync(demoDir)) return [];
  const re = new RegExp(`^${basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.(\\d+))?\\.json$`);
  return readdirSync(demoDir)
    .filter((name) => re.test(name))
    .sort((a, b) => {
      const idx = (n: string) => {
        const m = n.match(re);
        return m?.[1] !== undefined ? Number(m[1]) : -1;
      };
      return idx(a) - idx(b);
    });
}

function loadShardedRecord<T extends Record<string, unknown>>(
  basename: string,
): T {
  const files = listShardFiles(basename);
  if (!files.length) return {} as T;

  const merged = {} as T;
  for (const file of files) {
    const part = readDemoJson<Record<string, unknown>>(file, {});
    Object.assign(merged, part);
  }
  return merged;
}

export function loadFeedSchedules(feedId: string): Record<string, ScheduleRow[]> {
  const hit = scheduleCache.get(feedId);
  if (hit) return hit;
  const data = loadShardedRecord<Record<string, ScheduleRow[]>>(
    `${feedId}-schedules`,
  );
  scheduleCache.set(feedId, data);
  return data;
}

export function loadFeedTripStops(feedId: string): Record<string, TripStopRow[]> {
  const hit = tripStopCache.get(feedId);
  if (hit) return hit;
  const data = loadShardedRecord<Record<string, TripStopRow[]>>(
    `${feedId}-trip-stops`,
  );
  tripStopCache.set(feedId, data);
  return data;
}

export function loadUnionSchedule(): ScheduleRow[] {
  if (unionCache) return unionCache;
  unionCache = readDemoJson<ScheduleRow[]>("union-schedule.json", []);
  return unionCache;
}
