import {
  loadRouteScheduleRows,
  lookupTripScheduleRow,
  loadUnionSchedule,
} from "./demo-schedule-data";
import type { ScheduleRow } from "./demo-schedules";

import { hasDemoScheduleFeed } from "./demo-schedule-feeds";

export async function lookupTripFromSchedules(
  feedId: string,
  tripId: string,
): Promise<ScheduleRow | undefined> {
  if (hasDemoScheduleFeed(feedId)) {
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
  if (hasDemoScheduleFeed(feedId)) {
    const rows = await loadRouteScheduleRows(feedId, routeId);
    if (rows[0]) return rows[0];
  }
  const union = await loadUnionSchedule();
  return union.find(
    (r) =>
      r.feedId === feedId && (r.routeId === routeId || r.routeShort === routeId),
  );
}
