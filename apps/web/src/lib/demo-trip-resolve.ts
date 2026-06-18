import {
  gtfsTimeToSec,
  normalizeServiceSec,
  torontoNowSec,
} from "./calendar";
import { loadStopScheduleRows } from "./demo-schedule-data";
import type { ScheduleRow } from "./demo-schedule-types";
import { isDemoFixtureTripId } from "./demo-trip-id";
import { lookupTripFromSchedules } from "./demo-trip-lookup";
import { expandGoStopId } from "./go-stop-aliases";
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
      : expandGoStopId(anchor.stopId).includes("UN")
        ? "UN"
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
    if (delta < bestDelta && delta <= 20 * 60) {
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

/** Validate client-supplied schedule trip id against live RT / fuzzy resolve. */
export async function pickScheduleTripId(
  feedId: string,
  liveTripId: string,
  candidate: string | undefined,
  resolved: ResolvedTrip,
): Promise<string> {
  const fallback = resolved.scheduleTripId ?? liveTripId;
  if (!candidate || candidate === liveTripId) return fallback;

  const candidateRow = await lookupTripFromSchedules(feedId, candidate);
  if (!candidateRow) return fallback;

  const rt = getTripRt(feedId, liveTripId);

  if (candidateRow && rt?.routeId) {
    const routeOk =
      routesMatch(feedId, rt.routeId, rt.routeId, candidateRow.routeId) ||
      routesMatch(feedId, rt.routeId, rt.routeId, candidateRow.routeShort);
    if (!routeOk) return fallback;
  }

  if (
    resolved.scheduleTripId &&
    candidate !== resolved.scheduleTripId &&
    candidateRow &&
    resolved.scheduleRow
  ) {
    const sameRoute =
      routesMatch(
        feedId,
        candidateRow.routeId,
        candidateRow.routeShort,
        resolved.scheduleRow.routeId,
      ) ||
      routesMatch(
        feedId,
        candidateRow.routeId,
        candidateRow.routeShort,
        resolved.scheduleRow.routeShort,
      );
    if (!sameRoute) return fallback;
  }

  return candidate;
}
