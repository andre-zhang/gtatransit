import { getDemoCore, type DemoStopMeta } from "./demo";
import {
  loadStopScheduleRows,
  loadTripStopsForTrip,
  loadUnionSchedule,
  loadUnionScheduleForBoard,
} from "./demo-schedule-data";
import { resolveStopGroupId, TORONTO_UNION_ID } from "./demo-stop-groups";
import { ensureDemoAssets } from "./demo-assets";

import type { ScheduleRow, TripStopRow } from "./demo-schedule-types";

export type { ScheduleRow, TripStopRow } from "./demo-schedule-types";

import { hasDemoScheduleFeed } from "./demo-schedule-feeds";

async function rowsForMember(feedId: string, stopId: string): Promise<ScheduleRow[]> {
  if (hasDemoScheduleFeed(feedId)) {
    return loadStopScheduleRows(feedId, stopId);
  }
  const union = await loadUnionSchedule();
  return union.filter((r) => r.feedId === feedId && r.stopId === stopId);
}

export async function getStopSchedule(groupId: string): Promise<ScheduleRow[]> {
  await ensureDemoAssets();
  const resolved = resolveStopGroupId(groupId);
  if (resolved === TORONTO_UNION_ID) {
    const hub = getDemoCore().stops[TORONTO_UNION_ID];
    return loadUnionScheduleForBoard(hub?.members ?? [{ feedId: "go", stopId: "UN" }]);
  }

  const stop = getDemoCore().stops[resolved] as DemoStopMeta | undefined;
  if (!stop) return [];

  const rows = (
    await Promise.all(stop.members.map((m) => rowsForMember(m.feedId, m.stopId)))
  ).flat();
  return rows;
}

export async function getTripStops(
  feedId: string,
  tripId: string,
): Promise<TripStopRow[]> {
  return loadTripStopsForTrip(feedId, tripId);
}
