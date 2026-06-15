import {
  loadRouteScheduleRows,
  lookupTripScheduleRow,
  loadUnionSchedule,
} from "./demo-schedule-data";
import type { ScheduleRow } from "./demo-schedules";

const FEEDS_WITH_SCHEDULE_FILES = ["go", "up", "ttc", "miway"] as const;

export async function lookupTripFromSchedules(
  feedId: string,
  tripId: string,
): Promise<ScheduleRow | undefined> {
  if ((FEEDS_WITH_SCHEDULE_FILES as readonly string[]).includes(feedId)) {
    const hit = await lookupTripScheduleRow(feedId, tripId);
    if (hit) return hit;
  }
  const union = await loadUnionSchedule();
  return union.find((r) => r.feedId === feedId && r.tripId === tripId);
}

export async function lookupRouteFromSchedules(
  feedId: string,
  routeId: string,
): Promise<ScheduleRow | undefined> {
  if ((FEEDS_WITH_SCHEDULE_FILES as readonly string[]).includes(feedId)) {
    const rows = await loadRouteScheduleRows(feedId, routeId);
    if (rows[0]) return rows[0];
  }
  const union = await loadUnionSchedule();
  return union.find(
    (r) =>
      r.feedId === feedId && (r.routeId === routeId || r.routeShort === routeId),
  );
}
