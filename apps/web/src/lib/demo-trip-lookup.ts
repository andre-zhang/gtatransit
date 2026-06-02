import goSchedules from "../../demo/go-schedules.json";
import unionSchedule from "../../demo/union-schedule.json";
import type { ScheduleRow } from "./demo-schedules";

export function lookupTripFromSchedules(
  feedId: string,
  tripId: string,
): ScheduleRow | undefined {
  if (feedId === "go") {
    for (const rows of Object.values(goSchedules as Record<string, ScheduleRow[]>)) {
      const hit = rows.find((r) => r.tripId === tripId);
      if (hit) return hit;
    }
    return undefined;
  }
  return (unionSchedule as ScheduleRow[]).find(
    (r) => r.feedId === feedId && r.tripId === tripId,
  );
}

export function lookupRouteFromSchedules(feedId: string, routeId: string): ScheduleRow | undefined {
  if (feedId === "go") {
    for (const rows of Object.values(goSchedules as Record<string, ScheduleRow[]>)) {
      const hit = rows.find((r) => r.routeId === routeId);
      if (hit) return hit;
    }
  }
  return (unionSchedule as ScheduleRow[]).find(
    (r) => r.feedId === feedId && r.routeId === routeId,
  );
}
