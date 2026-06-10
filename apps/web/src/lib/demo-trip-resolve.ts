import {
  gtfsTimeToSec,
  normalizeServiceSec,
  torontoNowSec,
} from "./calendar";
import { loadStopScheduleRows } from "./demo-schedule-data";
import type { ScheduleRow } from "./demo-schedule-types";
import { isDemoFixtureTripId } from "./demo-trip-id";
import { lookupTripFromSchedules } from "./demo-trip-lookup";
import { routesMatch } from "./route-match";
import { getTripRt, getTripStopUpdates } from "./rt-cache";
import { fixtureStopIdForLive } from "./ttc-stop-registry";

export type ResolvedTrip = {
  liveTripId: string;
  scheduleTripId: string | undefined;
  scheduleRow: ScheduleRow | undefined;
  fuzzy: boolean;
};

export async function resolveDemoTrip(
  feedId: string,
  tripId: string,
): Promise<ResolvedTrip> {
  const exact = isDemoFixtureTripId(feedId, tripId)
    ? await lookupTripFromSchedules(feedId, tripId)
    : undefined;
  if (exact) {
    return {
      liveTripId: tripId,
      scheduleTripId: tripId,
      scheduleRow: exact,
      fuzzy: false,
    };
  }

  const updates = getTripStopUpdates(feedId, tripId);
  if (!updates.length) {
    return {
      liveTripId: tripId,
      scheduleTripId: undefined,
      scheduleRow: undefined,
      fuzzy: true,
    };
  }

  const routeId = getTripRt(feedId, tripId)?.routeId;
  const now = torontoNowSec();
  const anchor = updates.find((u) => u.predictedSec != null) ?? updates[0]!;
  const refSec =
    anchor.predictedSec != null
      ? normalizeServiceSec(anchor.predictedSec, now)
      : now;

  const schedStopId =
    feedId === "ttc"
      ? ((await fixtureStopIdForLive(anchor.stopId)) ?? anchor.stopId)
      : anchor.stopId;

  const rows = await loadStopScheduleRows(feedId, schedStopId);
  let best: ScheduleRow | undefined;
  let bestDelta = Infinity;
  for (const row of rows) {
    if (routeId) {
      const matches =
        routesMatch(feedId, routeId, routeId, row.routeId) ||
        routesMatch(feedId, routeId, routeId, row.routeShort);
      if (!matches) continue;
    }
    const schedNorm = normalizeServiceSec(gtfsTimeToSec(row.departureTime), now);
    const delta = Math.abs(schedNorm - refSec);
    if (delta < bestDelta && delta <= 50 * 60) {
      bestDelta = delta;
      best = row;
    }
  }

  return {
    liveTripId: tripId,
    scheduleTripId: best?.tripId,
    scheduleRow: best,
    fuzzy: true,
  };
}
