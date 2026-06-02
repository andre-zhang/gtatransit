import goSchedules from "../../demo/go-schedules.json";
import goTripStops from "../../demo/go-trip-stops.json";
import unionSchedule from "../../demo/union-schedule.json";
import { getDemoCore, type DemoStopMeta } from "./demo";
import { resolveStopGroupId } from "./demo-stop-groups";

export type ScheduleRow = {
  feedId: string;
  tripId: string;
  routeId: string;
  serviceId: string;
  departureTime: string;
  headsign: string;
  routeShort: string;
  routeColor: string;
  stopId: string;
};

export type TripStopRow = {
  stopId: string;
  name: string;
  sequence: number;
  arrivalTime: string;
  departureTime: string;
};

export function getStopSchedule(groupId: string): ScheduleRow[] {
  const resolved = resolveStopGroupId(groupId);
  const stop = getDemoCore().stops[resolved] as DemoStopMeta | undefined;
  if (!stop) return [];

  const rows: ScheduleRow[] = [];
  for (const m of stop.members) {
    if (m.feedId === "go") {
      const sched = (goSchedules as Record<string, ScheduleRow[]>)[m.stopId] ?? [];
      rows.push(...sched);
    } else if (m.feedId === "ttc" || m.feedId === "miway") {
      const union = unionSchedule as ScheduleRow[];
      rows.push(...union.filter((r) => r.stopId === m.stopId));
    }
  }
  return rows;
}

export function getTripStops(feedId: string, tripId: string): TripStopRow[] {
  if (feedId !== "go") return [];
  return (goTripStops as Record<string, TripStopRow[]>)[tripId] ?? [];
}
