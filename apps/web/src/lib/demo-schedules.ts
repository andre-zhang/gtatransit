import { getDemoCore, type DemoStopMeta } from "./demo";
import {
  loadStopScheduleRows,
  loadTripStopsForTrip,
  loadUnionSchedule,
  loadUnionScheduleForBoard,
} from "./demo-schedule-data";
import { resolveStopGroupId, TORONTO_UNION_ID } from "./demo-stop-groups";
import { ensureDemoStopAssets } from "./demo-assets";

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

export async function getStopSchedule(
  groupId: string,
  stop?: DemoStopMeta | null,
): Promise<ScheduleRow[]> {
  const resolved = resolveStopGroupId(groupId);
  if (resolved === TORONTO_UNION_ID) {
    const members = stop?.members ?? [{ feedId: "go", stopId: "UN" }];
    return loadUnionScheduleForBoard(members);
  }

  let meta = stop;
  if (!meta) {
    await ensureDemoStopAssets();
    meta = getDemoCore().stops[resolved] as DemoStopMeta | undefined;
  }
  if (!meta) return [];

  const rows = (
    await Promise.all(meta.members.map((m) => rowsForMember(m.feedId, m.stopId)))
  ).flat();
  return rows;
}

export async function getTripStops(
  feedId: string,
  tripId: string,
): Promise<TripStopRow[]> {
  return loadTripStopsForTrip(feedId, tripId);
}
