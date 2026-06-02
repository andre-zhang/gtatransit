import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScheduleRow, TripStopRow } from "./demo-schedule-types";

const demoDir = join(process.cwd(), "demo");

const scheduleCache = new Map<string, Record<string, ScheduleRow[]>>();
const tripStopCache = new Map<string, Record<string, TripStopRow[]>>();
let unionCache: ScheduleRow[] | null = null;

function readDemoJson<T>(filename: string, fallback: T): T {
  const path = join(demoDir, filename);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadFeedSchedules(feedId: string): Record<string, ScheduleRow[]> {
  const hit = scheduleCache.get(feedId);
  if (hit) return hit;
  const data = readDemoJson<Record<string, ScheduleRow[]>>(
    `${feedId}-schedules.json`,
    {},
  );
  scheduleCache.set(feedId, data);
  return data;
}

export function loadFeedTripStops(feedId: string): Record<string, TripStopRow[]> {
  const hit = tripStopCache.get(feedId);
  if (hit) return hit;
  const data = readDemoJson<Record<string, TripStopRow[]>>(
    `${feedId}-trip-stops.json`,
    {},
  );
  tripStopCache.set(feedId, data);
  return data;
}

export function loadUnionSchedule(): ScheduleRow[] {
  if (unionCache) return unionCache;
  unionCache = readDemoJson<ScheduleRow[]>("union-schedule.json", []);
  return unionCache;
}
