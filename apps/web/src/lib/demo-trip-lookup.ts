import { loadFeedSchedules, loadUnionSchedule } from "./demo-schedule-data";
import type { ScheduleRow } from "./demo-schedules";

const FEEDS_WITH_SCHEDULE_FILES = ["go", "ttc", "miway"] as const;

function findInFeedSchedules(
  feedId: string,
  pred: (row: ScheduleRow) => boolean,
): ScheduleRow | undefined {
  if ((FEEDS_WITH_SCHEDULE_FILES as readonly string[]).includes(feedId)) {
    const byStop = loadFeedSchedules(feedId);
    for (const rows of Object.values(byStop)) {
      const hit = rows.find(pred);
      if (hit) return hit;
    }
    return undefined;
  }
  return loadUnionSchedule().find((r) => r.feedId === feedId && pred(r));
}

export function lookupTripFromSchedules(
  feedId: string,
  tripId: string,
): ScheduleRow | undefined {
  return findInFeedSchedules(feedId, (r) => r.tripId === tripId);
}

export function lookupRouteFromSchedules(
  feedId: string,
  routeId: string,
): ScheduleRow | undefined {
  return findInFeedSchedules(
    feedId,
    (r) => r.routeId === routeId || r.routeShort === routeId,
  );
}
