import { getDemoCore, type DemoStopMeta } from "./demo";
import {
  loadStopScheduleRows,
  loadTripStopsForTrip,
  loadUnionSchedule,
} from "./demo-schedule-data";
import { resolveStopGroupId, TORONTO_UNION_ID } from "./demo-stop-groups";
import { ensureDemoAssets } from "./demo-assets";

import type { ScheduleRow, TripStopRow } from "./demo-schedule-types";

export type { ScheduleRow, TripStopRow } from "./demo-schedule-types";

const FEEDS_WITH_SCHEDULE_FILES = ["go", "ttc", "miway"] as const;

async function rowsForMember(feedId: string, stopId: string): Promise<ScheduleRow[]> {
  if ((FEEDS_WITH_SCHEDULE_FILES as readonly string[]).includes(feedId)) {
    return loadStopScheduleRows(feedId, stopId);
  }
  const union = await loadUnionSchedule();
  return union.filter((r) => r.feedId === feedId && r.stopId === stopId);
}

export async function getStopSchedule(groupId: string): Promise<ScheduleRow[]> {
  await ensureDemoAssets();
  const resolved = resolveStopGroupId(groupId);
  if (resolved === TORONTO_UNION_ID) {
    return loadUnionSchedule();
  }

  const stop = getDemoCore().stops[resolved] as DemoStopMeta | undefined;
  if (!stop) return [];

  const rows: ScheduleRow[] = [];
  for (const m of stop.members) {
    rows.push(...(await rowsForMember(m.feedId, m.stopId)));
  }
  return rows;
}

export async function getTripStops(
  feedId: string,
  tripId: string,
): Promise<TripStopRow[]> {
  return loadTripStopsForTrip(feedId, tripId);
}
