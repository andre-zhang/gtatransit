import { getDemoCore, type DemoStopMeta } from "./demo";
import {
  loadFeedSchedules,
  loadFeedTripStops,
  loadUnionSchedule,
} from "./demo-schedule-data";
import { resolveStopGroupId } from "./demo-stop-groups";
import { ensureDemoAssets } from "./demo-assets";

export type { ScheduleRow, TripStopRow } from "./demo-schedule-types";

const FEEDS_WITH_SCHEDULE_FILES = ["go", "ttc", "miway"] as const;

async function rowsForMember(feedId: string, stopId: string): Promise<ScheduleRow[]> {
  if ((FEEDS_WITH_SCHEDULE_FILES as readonly string[]).includes(feedId)) {
    const byStop = await loadFeedSchedules(feedId);
    return byStop[stopId] ?? [];
  }
  const union = await loadUnionSchedule();
  return union.filter((r) => r.feedId === feedId && r.stopId === stopId);
}

export async function getStopSchedule(groupId: string): Promise<ScheduleRow[]> {
  await ensureDemoAssets();
  const resolved = resolveStopGroupId(groupId);
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
  if (!(FEEDS_WITH_SCHEDULE_FILES as readonly string[]).includes(feedId)) {
    return [];
  }
  const byFeed = await loadFeedTripStops(feedId);
  return byFeed[tripId] ?? [];
}
