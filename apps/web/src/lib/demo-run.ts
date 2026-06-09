import { ensureDemoAssets } from "./demo";
import { loadDemoAssets } from "./demo-assets";
import { getGroupedDemoStops, resolveStopGroupId } from "./demo-stop-groups";
import { loadStopScheduleRows } from "./demo-schedule-data";
import { getTripStops } from "./demo-schedules";
import { lookupRouteFromSchedules, lookupTripFromSchedules } from "./demo-trip-lookup";
import { getDemoRoutesGeoJson } from "./demo-routes";
import { routeColor } from "./colors";
import {
  formatBoardTime,
  gtfsTimeToSec,
  normalizeServiceSec,
  secToTime,
  torontoNowSec,
} from "./calendar";
import type { ScheduleRow } from "./demo-schedule-types";
import { loadBlockTrips, loadFeedTripMeta } from "./demo-trip-meta";
import {
  getRtVehicle,
  getTripRt,
  getTripStopUpdates,
  getTripDelaySec,
} from "./rt-cache";

const OCCUPANCY_LABELS: Record<number, string> = {
  0: "Empty",
  1: "Many seats available",
  2: "Few seats available",
  3: "Standing room only",
  4: "Crushed standing room",
  5: "Full",
  6: "Not accepting passengers",
  7: "No data",
};

async function findRouteMeta(feedId: string, routeId: string | undefined) {
  if (!routeId) return null;
  const { core } = loadDemoAssets();
  for (const agency of core.filterTree.agencies) {
    if (agency.id !== feedId) continue;
    for (const mode of agency.modes) {
      const r = mode.routes.find((x) => x.id === routeId || x.shortName === routeId);
      if (r) {
        return {
          short_name: r.shortName,
          long_name: r.longName,
          color: routeColor(feedId, r.shortName, null),
        };
      }
    }
  }
  const sample = await lookupRouteFromSchedules(feedId, routeId);
  if (sample) {
    return {
      short_name: sample.routeShort,
      long_name: sample.headsign,
      color: sample.routeColor,
    };
  }
  return null;
}

function findShape(feedId: string, routeId: string | undefined, direction = 0) {
  if (!routeId) return null;
  const fc = getDemoRoutesGeoJson();
  const feature = fc.features.find(
    (f) =>
      f.properties?.feedId === feedId &&
      (f.properties?.routeId === routeId ||
        f.properties?.routeShort === routeId) &&
      Number(f.properties?.direction ?? 0) === direction,
  );
  if (feature) return feature;
  return (
    fc.features.find(
      (f) =>
        f.properties?.feedId === feedId &&
        (f.properties?.routeId === routeId || f.properties?.routeShort === routeId),
    ) ?? null
  );
}

function stopName(feedId: string, stopId: string): string {
  const meta = loadDemoAssets().stopMeta[feedId] as
    | Record<string, { name: string }>
    | undefined;
  return meta?.[stopId]?.name ?? stopId;
}

async function resolveScheduleTrip(
  feedId: string,
  liveTripId: string,
  routeId?: string,
  routeShort?: string,
): Promise<ScheduleRow | undefined> {
  const exact = await lookupTripFromSchedules(feedId, liveTripId);
  if (exact) return exact;

  const updates = getTripStopUpdates(feedId, liveTripId);
  if (!updates.length) return undefined;

  const now = torontoNowSec();
  const anchor = updates.find((u) => u.predictedSec != null) ?? updates[0]!;
  const refSec =
    anchor.predictedSec != null
      ? normalizeServiceSec(anchor.predictedSec, now)
      : now;

  const rows = await loadStopScheduleRows(feedId, anchor.stopId);
  let best: ScheduleRow | undefined;
  let bestDelta = Infinity;
  for (const row of rows) {
    if (routeId && row.routeId !== routeId && row.routeShort !== routeShort) continue;
    const schedNorm = normalizeServiceSec(gtfsTimeToSec(row.departureTime), now);
    const delta = Math.abs(schedNorm - refSec);
    if (delta < bestDelta && delta <= 50 * 60) {
      bestDelta = delta;
      best = row;
    }
  }
  return best;
}

type UpcomingStop = {
  stop_id: string;
  name: string;
  sequence?: number;
  scheduled: string;
  predicted?: string;
  platform?: string;
  delayMin?: number;
};

async function buildUpcomingStops(
  feedId: string,
  liveTripId: string,
  scheduleTripId: string | undefined,
  fromSequence: number | undefined,
): Promise<UpcomingStop[]> {
  const now = torontoNowSec();
  const schedStops = scheduleTripId
    ? await getTripStops(feedId, scheduleTripId)
    : [];
  const rtByStop = new Map(
    getTripStopUpdates(feedId, liveTripId).map((u) => [u.stopId, u]),
  );

  if (schedStops.length) {
    const startIdx =
      fromSequence != null
        ? schedStops.findIndex((s) => s.sequence >= fromSequence)
        : 0;
    const slice = startIdx >= 0 ? schedStops.slice(startIdx) : schedStops;
    return slice.map((s) => {
      const schedSec = gtfsTimeToSec(s.departureTime);
      const rt = rtByStop.get(s.stopId);
      const delaySec = rt?.delaySec;
      let predictedSec = rt?.predictedSec;
      if (predictedSec == null && delaySec != null) predictedSec = schedSec + delaySec;
      const schedFmt = formatBoardTime(schedSec, now);
      const predFmt =
        predictedSec != null ? formatBoardTime(predictedSec, now) : null;
      return {
        stop_id: s.stopId,
        name: s.name,
        sequence: s.sequence,
        scheduled: schedFmt.time,
        predicted: predFmt?.time,
        platform: rt?.platform,
        delayMin: delaySec != null ? Math.round(delaySec / 60) : undefined,
      };
    });
  }

  return getTripStopUpdates(feedId, liveTripId).map((u) => {
    const schedSec = u.predictedSec ?? now;
    const fmt = formatBoardTime(schedSec, now);
    return {
      stop_id: u.stopId,
      name: stopName(feedId, u.stopId),
      scheduled: fmt.time,
      predicted: fmt.time,
      platform: u.platform,
      delayMin: u.delaySec != null ? Math.round(u.delaySec / 60) : undefined,
    };
  });
}

function inferCurrentStopIndex(
  upcoming: UpcomingStop[],
  fromSequence: number | undefined,
): number {
  if (fromSequence != null && upcoming.some((s) => s.sequence === fromSequence)) {
    return upcoming.findIndex((s) => s.sequence === fromSequence);
  }
  const now = torontoNowSec();
  let bestIdx = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < upcoming.length; i++) {
    const s = upcoming[i]!;
    const sec = normalizeServiceSec(
      gtfsTimeToSec(s.predicted ?? s.scheduled),
      now,
    );
    const delta = now - sec;
    if (delta >= -60 && delta < bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export async function getDemoRun(feedId: string, vehicleId: string) {
  await ensureDemoAssets();

  const vehicle = getRtVehicle(feedId, vehicleId);
  if (!vehicle || vehicle.lat == null || vehicle.lon == null) return null;

  const liveTripId = vehicle.tripId;
  const tripRt = liveTripId ? getTripRt(feedId, liveTripId) : undefined;
  const routeId =
    vehicle.routeId ?? tripRt?.routeId;
  const route = await findRouteMeta(feedId, routeId);
  const scheduleTrip = liveTripId
    ? await resolveScheduleTrip(
        feedId,
        liveTripId,
        routeId,
        route?.short_name ?? undefined,
      )
    : undefined;
  const scheduleTripId = scheduleTrip?.tripId ?? liveTripId;
  const shape = findShape(feedId, routeId);
  const headsign = scheduleTrip?.headsign ?? null;

  const allUpcoming = liveTripId
    ? await buildUpcomingStops(
        feedId,
        liveTripId,
        scheduleTripId,
        vehicle.currentStopSequence,
      )
    : [];

  const currentIdx = inferCurrentStopIndex(
    allUpcoming,
    vehicle.currentStopSequence,
  );
  const currentStop = allUpcoming[currentIdx] ?? null;
  const nextStops = allUpcoming.slice(currentIdx + 1, currentIdx + 13);

  const delaySec =
    (liveTripId ? getTripDelaySec(feedId, liveTripId) : undefined) ??
    tripRt?.delaySec ??
    vehicle.delaySec;

  const blockTrips = scheduleTripId
    ? await loadBlockTrips(feedId, scheduleTripId, liveTripId ?? scheduleTripId)
    : [];
  const tripMeta = scheduleTripId
    ? await loadFeedTripMeta(feedId, scheduleTripId)
    : undefined;

  return {
    vehicle: {
      id: vehicle.vehicleId,
      label: vehicle.label?.trim() || vehicle.vehicleId,
      lat: vehicle.lat,
      lon: vehicle.lon,
      bearing: vehicle.bearing ?? null,
      speed: vehicle.speed ?? null,
      occupancy: OCCUPANCY_LABELS[vehicle.occupancyStatus ?? 7] ?? "No data",
      delayMin: delaySec != null ? Math.round(delaySec / 60) : null,
      updatedAt: new Date().toISOString(),
    },
    trip: liveTripId
      ? {
          trip_id: liveTripId,
          schedule_trip_id: scheduleTripId ?? null,
          route_id: routeId ?? "",
          headsign,
          block_id: tripMeta?.blockId ?? null,
        }
      : null,
    route: route
      ? {
          short_name: route.short_name,
          long_name: route.long_name,
          color: route.color,
        }
      : scheduleTrip
        ? {
            short_name: scheduleTrip.routeShort,
            long_name: scheduleTrip.headsign,
            color: scheduleTrip.routeColor,
          }
        : null,
    currentStop: currentStop
      ? { stop_id: currentStop.stop_id, name: currentStop.name }
      : null,
    upcomingStops: nextStops,
    blockTrips,
    shape,
  };
}

export function resolveDemoStop(groupId: string) {
  const id = resolveStopGroupId(groupId);
  return getGroupedDemoStops()[id];
}
