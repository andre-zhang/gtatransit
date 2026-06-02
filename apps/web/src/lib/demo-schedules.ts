import { getDemoCore, type DemoStopMeta } from "./demo";
import {
  loadFeedSchedules,
  loadFeedTripStops,
  loadUnionSchedule,
} from "./demo-schedule-data";
import { resolveStopGroupId } from "./demo-stop-groups";

export type { ScheduleRow, TripStopRow } from "./demo-schedule-types";

const FEEDS_WITH_SCHEDULE_FILES = ["go", "ttc", "miway"] as const;

import type { ScheduleRow, TripStopRow } from "./demo-schedule-types";

function rowsForMember(feedId: string, stopId: string): ScheduleRow[] {
  if ((FEEDS_WITH_SCHEDULE_FILES as readonly string[]).includes(feedId)) {
    return loadFeedSchedules(feedId)[stopId] ?? [];
  }
  return loadUnionSchedule().filter(
    (r) => r.feedId === feedId && r.stopId === stopId,
  );
}

export function getStopSchedule(groupId: string): ScheduleRow[] {
  const resolved = resolveStopGroupId(groupId);
  const stop = getDemoCore().stops[resolved] as DemoStopMeta | undefined;
  if (!stop) return [];

  const rows: ScheduleRow[] = [];
  for (const m of stop.members) {
    rows.push(...rowsForMember(m.feedId, m.stopId));
  }
  return rows;
}

export function getTripStops(feedId: string, tripId: string): TripStopRow[] {
  if (!(FEEDS_WITH_SCHEDULE_FILES as readonly string[]).includes(feedId)) {
    return [];
  }
  return loadFeedTripStops(feedId)[tripId] ?? [];
}
