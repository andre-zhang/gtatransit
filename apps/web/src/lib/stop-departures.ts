import {
  filterUpcomingDepartures,
  gtfsTimeToSec,
  type DepartureInput,
  type DepartureRowOut,
} from "@/lib/departures";
import { isUnixTimestamp, secToTime, unixToTorontoSec } from "@/lib/calendar";
import { routeColor } from "@/lib/colors";
import { getDemoCore } from "@/lib/demo";
import type { DemoStopMeta } from "@/lib/demo";
import { getStopSchedule } from "@/lib/demo-schedules";
import {
  getRtPredictionsForStop,
  mergeRtIntoDeparture,
  refreshRtCache,
  type RtStopPrediction,
} from "@/lib/rt-cache";

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

function rtPredictionToDeparture(row: RtStopPrediction): DepartureInput | null {
  const routeId = row.routeId;
  const coreMeta = routeMetaFromCore(row.feedId, routeId);
  let predictedSec = row.predictedSec;
  if (predictedSec != null && isUnixTimestamp(predictedSec)) {
    predictedSec = unixToTorontoSec(predictedSec);
  }
  if (predictedSec == null && row.delaySec == null) return null;

  const schedSec = predictedSec ?? gtfsTimeToSec(secToTime((Date.now() / 1000) % 86400));
  let delaySec = row.delaySec;
  if (delaySec == null && predictedSec != null) {
    const drift = predictedSec - schedSec;
    if (Math.abs(drift) >= 30) delaySec = drift;
  }

  return {
    tripId: row.tripId,
    feedId: row.feedId,
    routeId: routeId ?? "",
    routeShort: coreMeta?.routeShort ?? routeId ?? "?",
    routeColor: routeColor(row.feedId, coreMeta?.routeShort ?? null, null),
    destination: coreMeta?.destination ?? "In service",
    departureTime: secToTime(schedSec % 86400),
    stopId: row.stopId,
    delaySec,
    predictedSec: predictedSec ?? undefined,
    realtime: true,
    vehicleId: row.vehicleId,
  };
}

export async function buildDemoStopDepartures(
  groupId: string,
  stop: DemoStopMeta,
): Promise<{ name: string; rows: DepartureRowOut[] }> {
  const memberStopIds = stop.members.map((m) => m.stopId);
  const usedRtTrips = new Set<string>();

  const [, schedule] = await Promise.all([
    refreshRtCache(true),
    getStopSchedule(groupId),
  ]);

  const inputs: DepartureInput[] = schedule.map((r) => {
    const schedSec = gtfsTimeToSec(r.departureTime);
    const rt = mergeRtIntoDeparture(
      r.feedId,
      r.tripId,
      r.stopId,
      schedSec,
      memberStopIds,
      {
        routeId: r.routeId,
        routeShort: r.routeShort,
        usedRtTrips,
      },
    );
    return {
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
    };
  });

  const seenTrips = new Set(inputs.map((r) => `${r.feedId}:${r.tripId}`));
  const feedsSeen = new Set<string>();
  for (const m of stop.members) {
    if (feedsSeen.has(m.feedId)) continue;
    feedsSeen.add(m.feedId);
    const idsForFeed = stop.members
      .filter((x) => x.feedId === m.feedId)
      .map((x) => x.stopId);
    const exclude = new Set([...seenTrips, ...usedRtTrips]);
    const extras = getRtPredictionsForStop(m.feedId, idsForFeed, exclude);
    for (const extra of extras) {
      seenTrips.add(`${extra.feedId}:${extra.tripId}`);
      const row = rtPredictionToDeparture(extra);
      if (row) inputs.push(row);
    }
  }

  return {
    name: stop.name,
    rows: filterUpcomingDepartures(inputs),
  };
}
