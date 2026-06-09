import {
  filterUpcomingDepartures,
  gtfsTimeToSec,
  type DepartureInput,
  type DepartureRowOut,
} from "@/lib/departures";
import { isUnixTimestamp, secToTime, torontoNowSec, unixToTorontoSec } from "@/lib/calendar";
import { routeColor } from "@/lib/colors";
import { getDemoCore } from "@/lib/demo";
import type { DemoStopMeta } from "@/lib/demo";
import type { ScheduleRow } from "@/lib/demo-schedule-types";
import { getStopSchedule } from "@/lib/demo-schedules";
import {
  getActiveVehicleForRoute,
  getRtPredictionsForStop,
  getTripDelaySec,
  mergeRtIntoDeparture,
  refreshRtCache,
  type RtStopPrediction,
} from "@/lib/rt-cache";

function normalizeDepSec(schedSec: number, now: number): number {
  let depSec = schedSec;
  if (depSec < now - 120) depSec += 86400;
  if (depSec < now - 120) depSec += 86400;
  return depSec;
}

function routeMetaFromCore(feedId: string, routeId: string | undefined) {
  if (!routeId) return null;
  for (const agency of getDemoCore().filterTree.agencies) {
    if (agency.id !== feedId) continue;
    for (const mode of agency.modes) {
      const r = mode.routes.find((x) => x.id === routeId || x.shortName === routeId);
      if (r) {
        return {
          routeShort: r.shortName,
          routeColor: routeColor(feedId, r.shortName, null),
          destination: r.longName,
        };
      }
    }
  }
  return null;
}

function buildRoutesByStop(schedule: ScheduleRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of schedule) {
    const key = `${row.feedId}:${row.stopId}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(row.routeShort);
    map.get(key)!.add(row.routeId);
  }
  return map;
}

function routeScheduledAtStop(
  routesByStop: Map<string, Set<string>>,
  feedId: string,
  stopId: string,
  routeId: string | undefined,
  routeShort: string | undefined,
): boolean {
  const allowed = routesByStop.get(`${feedId}:${stopId}`);
  if (!allowed) return false;
  if (routeShort && allowed.has(routeShort)) return true;
  if (routeId && allowed.has(routeId)) return true;
  return false;
}

function scheduleHeadsignByRoute(
  schedule: ScheduleRow[],
): Map<string, { headsign: string; routeColor: string }> {
  const map = new Map<string, { headsign: string; routeColor: string }>();
  for (const row of schedule) {
    const key = `${row.feedId}:${row.routeShort || row.routeId}`;
    if (!map.has(key)) {
      map.set(key, { headsign: row.headsign, routeColor: row.routeColor });
    }
  }
  return map;
}

function rtPredictionToDeparture(
  row: RtStopPrediction,
  headsigns: Map<string, { headsign: string; routeColor: string }>,
  routesByStop: Map<string, Set<string>>,
): DepartureInput | null {
  const routeId = row.routeId;
  const coreMeta = routeMetaFromCore(row.feedId, routeId);
  const routeShort = coreMeta?.routeShort ?? routeId ?? "?";
  if (!routeScheduledAtStop(routesByStop, row.feedId, row.stopId, routeId, routeShort)) {
    return null;
  }
  const schedMeta = routeId
    ? headsigns.get(`${row.feedId}:${routeShort}`)
    : undefined;
  let predictedSec = row.predictedSec;
  if (predictedSec != null && isUnixTimestamp(predictedSec)) {
    predictedSec = unixToTorontoSec(predictedSec);
  }
  if (predictedSec == null && row.delaySec == null) return null;

  const schedSec = predictedSec ?? gtfsTimeToSec(secToTime((Date.now() / 1000) % 86400));
  let delaySec = row.delaySec;
  if (delaySec == null && predictedSec != null) {
    delaySec = 0;
  }

  return {
    tripId: row.tripId,
    feedId: row.feedId,
    routeId: routeId ?? "",
    routeShort,
    routeColor: schedMeta?.routeColor ?? routeColor(row.feedId, routeShort, null),
    destination: schedMeta?.headsign ?? coreMeta?.destination ?? "In service",
    departureTime: secToTime(schedSec % 86400),
    stopId: row.stopId,
    delaySec,
    predictedSec: predictedSec ?? undefined,
    realtime: true,
    vehicleId: row.vehicleId,
  };
}

function enrichNextPerRouteWithVehicles(rows: DepartureInput[]): DepartureInput[] {
  const now = torontoNowSec();
  const nextByRoute = new Map<string, DepartureInput>();

  for (const row of rows) {
    if (row.realtime) continue;
    const schedSec = normalizeDepSec(gtfsTimeToSec(row.departureTime), now);
    if (schedSec < now - 120 || schedSec > now + 90 * 60) continue;
    const key = `${row.feedId}:${row.routeShort || row.routeId}`;
    const prev = nextByRoute.get(key);
    if (!prev || schedSec < normalizeDepSec(gtfsTimeToSec(prev.departureTime), now)) {
      nextByRoute.set(key, row);
    }
  }

  return rows.map((row) => {
    const key = `${row.feedId}:${row.routeShort || row.routeId}`;
    if (nextByRoute.get(key) !== row) return row;

    const vehicle = getActiveVehicleForRoute(row.feedId, row.routeId, row.routeShort);
    if (!vehicle?.tripId) return row;

    const schedSec = gtfsTimeToSec(row.departureTime);
    const delaySec = getTripDelaySec(row.feedId, vehicle.tripId) ?? 0;
    return {
      ...row,
      tripId: vehicle.tripId,
      realtime: true,
      vehicleId: vehicle.vehicleId,
      delaySec,
      predictedSec: schedSec + delaySec,
    };
  });
}

function dedupeNearLive(rows: DepartureInput[]): DepartureInput[] {
  const now = torontoNowSec();
  const liveKeys: Array<{ feedId: string; route: string; sec: number }> = [];

  for (const row of rows) {
    if (!row.realtime) continue;
    const sec = normalizeDepSec(
      row.predictedSec ?? gtfsTimeToSec(row.departureTime),
      now,
    );
    liveKeys.push({
      feedId: row.feedId,
      route: row.routeShort || row.routeId,
      sec,
    });
  }

  return rows.filter((row) => {
    if (row.realtime) return true;
    const sec = normalizeDepSec(gtfsTimeToSec(row.departureTime), now);
    return !liveKeys.some(
      (live) =>
        live.feedId === row.feedId &&
        live.route === (row.routeShort || row.routeId) &&
        Math.abs(live.sec - sec) <= 240,
    );
  });
}

export async function buildDemoStopDepartures(
  groupId: string,
  stop: DemoStopMeta,
): Promise<{ name: string; rows: DepartureRowOut[] }> {
  const usedRtTrips = new Set<string>();

  await refreshRtCache(true);
  const schedule = await getStopSchedule(groupId);
  const headsigns = scheduleHeadsignByRoute(schedule);
  const routesByStop = buildRoutesByStop(schedule);

  const inputs: DepartureInput[] = [];

  const feedsSeen = new Set<string>();
  for (const m of stop.members) {
    if (feedsSeen.has(m.feedId)) continue;
    feedsSeen.add(m.feedId);
    const idsForFeed = stop.members
      .filter((x) => x.feedId === m.feedId)
      .map((x) => x.stopId);
    for (const extra of getRtPredictionsForStop(m.feedId, idsForFeed, new Set())) {
      const row = rtPredictionToDeparture(extra, headsigns, routesByStop);
      if (!row) continue;
      usedRtTrips.add(`${row.feedId}:${row.tripId}`);
      inputs.push(row);
    }
  }

  for (const r of schedule) {
    const schedSec = gtfsTimeToSec(r.departureTime);
    const rt = mergeRtIntoDeparture(
      r.feedId,
      r.tripId,
      r.stopId,
      schedSec,
      [r.stopId],
      {
        routeId: r.routeId,
        routeShort: r.routeShort,
        usedRtTrips,
      },
    );
    inputs.push({
      tripId: rt.liveTripId ?? r.tripId,
      feedId: r.feedId,
      routeId: r.routeId,
      routeShort: r.routeShort,
      routeColor: r.routeColor,
      destination: r.headsign,
      departureTime: r.departureTime,
      stopId: r.stopId,
      platform: r.feedId === "go" ? rt.platform : undefined,
      delaySec: rt.delaySec,
      predictedSec: rt.predictedSec,
      realtime: rt.realtime,
      vehicleId: rt.vehicleId,
    });
  }

  const enriched = enrichNextPerRouteWithVehicles(inputs);
  const deduped = dedupeNearLive(enriched);

  return {
    name: stop.name,
    rows: filterUpcomingDepartures(deduped),
  };
}
