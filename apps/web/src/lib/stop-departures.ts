import {
  computeDelaySec,
  filterUpcomingDepartures,
  gtfsTimeToSec,
  type DepartureInput,
  type DepartureRowOut,
} from "@/lib/departures";
import {
  isUnixTimestamp,
  normalizeServiceSec,
  secToTime,
  torontoNowSec,
  unixToTorontoSec,
} from "@/lib/calendar";
import { routeColor } from "@/lib/colors";
import { getDemoCore } from "@/lib/demo";
import type { DemoStopMeta } from "@/lib/demo";
import type { ScheduleRow } from "@/lib/demo-schedule-types";
import {
  needsHeadsignLookup,
  preloadTripHeadsignIndex,
  tripHeadsigns,
} from "@/lib/demo-trip-headsign";
import { getStopSchedule } from "@/lib/demo-schedules";
import { routesMatch } from "@/lib/route-match";
import {
  getRtPredictionsForStop,
  mergeRtIntoDeparture,
  refreshRtCache,
  type RtStopPrediction,
} from "@/lib/rt-cache";
import { expandGoStopId, resolveGoRtStopIds } from "@/lib/go-stop-aliases";
import { isTtcRtStopAtGroup, resolveTtcRtStopIds } from "@/lib/ttc-stop-registry";

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

function rtPredictionToDeparture(
  row: RtStopPrediction,
  schedule: ScheduleRow[],
): DepartureInput | null {
  const routeId = row.routeId;
  const coreMeta = routeMetaFromCore(row.feedId, routeId);
  const routeShort = coreMeta?.routeShort ?? routeId ?? "?";
  let predictedSec = row.predictedSec;
  if (predictedSec != null && isUnixTimestamp(predictedSec)) {
    predictedSec = unixToTorontoSec(predictedSec);
  }
  if (predictedSec == null && row.delaySec == null) return null;

  const now = torontoNowSec();
  const predNorm =
    predictedSec != null ? normalizeServiceSec(predictedSec, now) : null;

  let scheduledRow: ScheduleRow | undefined;
  if (predNorm != null) {
    let bestDelta = Infinity;
    for (const s of schedule) {
      if (s.feedId !== row.feedId) continue;
      if (
        routeId &&
        !routesMatch(row.feedId, routeId, routeShort, s.routeId) &&
        !routesMatch(row.feedId, routeId, routeShort, s.routeShort)
      ) {
        continue;
      }
      const schedNorm = normalizeServiceSec(gtfsTimeToSec(s.departureTime), now);
      const delta = Math.abs(schedNorm - predNorm);
      if (delta < bestDelta && delta <= 50 * 60) {
        bestDelta = delta;
        scheduledRow = s;
      }
    }
  }

  const schedSec = scheduledRow
    ? gtfsTimeToSec(scheduledRow.departureTime)
    : (predictedSec ?? gtfsTimeToSec(secToTime((Date.now() / 1000) % 86400)));

  const delaySec = computeDelaySec(schedSec, {
    predictedSec,
    agencyDelaySec: row.delaySec,
    now,
  });

  return {
    tripId: row.tripId,
    scheduleTripId: scheduledRow?.tripId ?? row.tripId,
    feedId: row.feedId,
    routeId: routeId ?? "",
    routeShort,
    routeColor:
      scheduledRow?.routeColor ?? routeColor(row.feedId, routeShort, null),
    destination: scheduledRow?.headsign ?? "In service",
    departureTime: secToTime(schedSec % 86400),
    stopId: row.stopId,
    delaySec,
    predictedSec: predictedSec ?? undefined,
    realtime: true,
    vehicleId: row.vehicleId,
  };
}

function dedupeNearLive(rows: DepartureInput[]): DepartureInput[] {
  const now = torontoNowSec();
  const liveKeys: Array<{ feedId: string; route: string; sec: number }> = [];

  for (const row of rows) {
    if (!row.realtime) continue;
    const sec = normalizeServiceSec(
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
    const sec = normalizeServiceSec(gtfsTimeToSec(row.departureTime), now);
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

  await refreshRtCache();
  const schedule = await getStopSchedule(groupId);
  const rtStopIdsByFeed = new Map<string, string[]>();

  for (const m of stop.members) {
    if (m.feedId === "ttc") {
      rtStopIdsByFeed.set("ttc", await resolveTtcRtStopIds(stop.members));
    } else if (m.feedId === "go" && !rtStopIdsByFeed.has("go")) {
      const ids = new Set<string>();
      for (const x of stop.members.filter((x) => x.feedId === "go")) {
        for (const id of expandGoStopId(x.stopId)) ids.add(id);
      }
      rtStopIdsByFeed.set("go", [...ids]);
    } else if (!rtStopIdsByFeed.has(m.feedId)) {
      rtStopIdsByFeed.set(
        m.feedId,
        stop.members.filter((x) => x.feedId === m.feedId).map((x) => x.stopId),
      );
    }
  }

  const inputs: DepartureInput[] = [];

  for (const [feedId, rtStopIds] of rtStopIdsByFeed) {
    for (const extra of getRtPredictionsForStop(feedId, rtStopIds, new Set())) {
      if (feedId === "ttc" && !(await isTtcRtStopAtGroup(extra.stopId, stop.members))) {
        continue;
      }
      const row = rtPredictionToDeparture(extra, schedule);
      if (!row) continue;
      usedRtTrips.add(`${row.feedId}:${row.tripId}`);
      inputs.push(row);
    }
  }

  const ttcRtByMember = new Map<string, string[]>();
  async function ttcRtIdsForStop(stopId: string): Promise<string[]> {
    let ids = ttcRtByMember.get(stopId);
    if (!ids) {
      ids = await resolveTtcRtStopIds([{ feedId: "ttc", stopId }]);
      ttcRtByMember.set(stopId, ids);
    }
    return ids;
  }

  for (const r of schedule) {
    const rtIds =
      r.feedId === "ttc"
        ? await ttcRtIdsForStop(r.stopId)
        : r.feedId === "go"
          ? resolveGoRtStopIds(r.stopId, stop.members)
          : [r.stopId];
    const schedSec = gtfsTimeToSec(r.departureTime);
    const rt = mergeRtIntoDeparture(
      r.feedId,
      r.tripId,
      r.stopId,
      schedSec,
      rtIds,
      {
        routeId: r.routeId,
        routeShort: r.routeShort,
        usedRtTrips,
      },
    );
    inputs.push({
      tripId: rt.liveTripId ?? r.tripId,
      scheduleTripId: r.tripId,
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

  const deduped = dedupeNearLive(inputs);

  const scheduleHeadsigns = new Map<string, string>();
  for (const row of schedule) {
    const hs = row.headsign?.trim();
    if (hs) scheduleHeadsigns.set(`${row.feedId}:${row.tripId}`, hs);
  }

  const missingByFeed = new Map<string, Set<string>>();
  for (const row of deduped) {
    const key = `${row.feedId}:${row.tripId}`;
    if (scheduleHeadsigns.has(key)) continue;
    if (row.realtime || needsHeadsignLookup(row.destination)) {
      if (!missingByFeed.has(row.feedId)) missingByFeed.set(row.feedId, new Set());
      missingByFeed.get(row.feedId)!.add(row.tripId);
    }
  }

  const resolved = new Map<string, string | null>();
  await Promise.all(
    [...missingByFeed.entries()].map(async ([feedId, tripIds]) => {
      await preloadTripHeadsignIndex(feedId);
      const hits = await tripHeadsigns(feedId, [...tripIds]);
      for (const [tripId, hs] of hits) {
        resolved.set(`${feedId}:${tripId}`, hs);
      }
    }),
  );

  const withHeadsigns = deduped.map((row) => {
    const key = `${row.feedId}:${row.tripId}`;
    const hs = scheduleHeadsigns.get(key) ?? resolved.get(key);
    if (!hs) return row;
    if (!row.realtime && !needsHeadsignLookup(row.destination)) return row;
    return { ...row, destination: hs };
  });

  return {
    name: stop.name,
    rows: filterUpcomingDepartures(withHeadsigns),
  };
}
