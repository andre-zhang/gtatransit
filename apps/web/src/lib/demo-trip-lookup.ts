import { loadFeedSchedules, loadUnionSchedule } from "./demo-schedule-data";
import type { ScheduleRow } from "./demo-schedules";

const FEEDS_WITH_SCHEDULE_FILES = ["go", "ttc", "miway"] as const;

async function findInFeedSchedules(
  feedId: string,
  pred: (row: ScheduleRow) => boolean,
): Promise<ScheduleRow | undefined> {
  if ((FEEDS_WITH_SCHEDULE_FILES as readonly string[]).includes(feedId)) {
    const byStop = await loadFeedSchedules(feedId);
    for (const rows of Object.values(byStop)) {
      const hit = rows.find(pred);
      if (hit) return hit;
    }
    return undefined;
  }
  const union = await loadUnionSchedule();
  return union.find((r) => r.feedId === feedId && pred(r));
}

export async function lookupTripFromSchedules(
  feedId: string,
  tripId: string,
): Promise<ScheduleRow | undefined> {
  return findInFeedSchedules(feedId, (r) => r.tripId === tripId);
}

export async function lookupRouteFromSchedules(
  feedId: string,
  routeId: string,
): Promise<ScheduleRow | undefined> {
  return findInFeedSchedules(
    feedId,
    (r) => r.routeId === routeId || r.routeShort === routeId,
  );
}
