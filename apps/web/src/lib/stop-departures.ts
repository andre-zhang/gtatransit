import {
  computeDelaySec,
  dedupeDepartures,
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
import type { DemoStopMeta } from "@/lib/demo";
import type { ScheduleRow } from "@/lib/demo-schedule-types";
import { readDemoJsonFile } from "@/lib/demo-read";
import type { FilterTree } from "@/lib/types";
import {
  needsHeadsignLookup,
  preloadTripHeadsignIndex,
  tripHeadsigns,
} from "@/lib/demo-trip-headsign";
import { getStopSchedule } from "@/lib/demo-schedules";
import { routesMatch, routeTail } from "@/lib/route-match";
import {
  getRtPredictionsForStop,
  mergeRtIntoDeparture,
  ensureRtCacheWithin,
  isRtCacheWarm,
  type RtStopPrediction,
} from "@/lib/rt-cache";
import { expandGoStopId, formatGoPlatform, goTripsMatch, resolveGoRtStopIds } from "@/lib/go-stop-aliases";
import { cleanHeadsign } from "@/lib/headsign";
import { resolveTtcRtStopIds } from "@/lib/ttc-stop-registry";

/** Trim large union-style schedules before RT merge (board shows ~80 rows). */
function scheduleForMembers(
  schedule: ScheduleRow[],
  members: DemoStopMeta["members"],
): ScheduleRow[] {
  const keys = new Set(members.map((m) => `${m.feedId}:${m.stopId}`));
  return schedule.filter((r) => keys.has(`${r.feedId}:${r.stopId}`));
}

function filterScheduleToBoardWindow(schedule: ScheduleRow[]): ScheduleRow[] {
  const now = torontoNowSec();
  const pastGrace = 120;
  const horizon = 2 * 3600;
  const upcoming = schedule
    .map((r) => ({
      row: r,
      sec: normalizeServiceSec(gtfsTimeToSec(r.departureTime), now),
    }))
    .filter(({ sec }) => sec >= now - pastGrace && sec <= now + horizon)
    .sort((a, b) => a.sec - b.sec)
    .slice(0, 250)
    .map(({ row }) => row);
  return upcoming;
}

let fixturesTree: FilterTree | null = null;

async function loadFixturesTree(): Promise<FilterTree> {
  if (fixturesTree) return fixturesTree;
  const core = await readDemoJsonFile<{ filterTree: FilterTree }>("fixtures.json");
  fixturesTree = core.filterTree;
  return fixturesTree;
}

function routeMetaFromTree(
  tree: FilterTree,
  feedId: string,
  routeId: string | undefined,
) {
  if (!routeId) return null;
  for (const agency of tree.agencies) {
    if (agency.id !== feedId) continue;
    for (const mode of agency.modes) {
      const r = mode.routes.find((x) => x.id === routeId || x.shortName === routeId);
      if (r) {
        return {
          routeShort: r.shortName,
          routeColor: routeColor(feedId, r.shortName, null, r.id),
          destination: r.longName,
        };
      }
    }
  }
  return null;
}

function scheduleRowsToInputs(schedule: ScheduleRow[]): DepartureInput[] {
  return schedule.map((r) => ({
    tripId: r.tripId,
    scheduleTripId: r.tripId,
    feedId: r.feedId,
    routeId: r.routeId,
    routeShort: r.routeShort,
    routeColor: r.routeColor,
    destination: cleanHeadsign(r.headsign),
    departureTime: r.departureTime,
    stopId: r.stopId,
    realtime: false,
  }));
}

async function loadBoardSchedule(groupId: string, stop: DemoStopMeta) {
  const rawSchedule = await getStopSchedule(groupId, stop);
  return filterScheduleToBoardWindow(scheduleForMembers(rawSchedule, stop.members));
}

function routeMetaFromCore(feedId: string, routeId: string | undefined) {
  if (!routeId || !fixturesTree) return null;
  return routeMetaFromTree(fixturesTree, feedId, routeId);
}

function rtPredictionToDeparture(
  row: RtStopPrediction,
  schedule: ScheduleRow[],
): DepartureInput | null {
  const routeId = row.routeId;
  const coreMeta =
    routeMetaFromCore(row.feedId, routeId) ??
    (routeId ? routeMetaFromCore(row.feedId, routeTail(routeId)) : null);
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
  for (const s of schedule) {
    if (s.feedId !== row.feedId) continue;
    if (s.tripId === row.tripId) {
      scheduledRow = s;
      break;
    }
    if (row.feedId === "go" && goTripsMatch(s.tripId, row.tripId)) {
      scheduledRow = s;
      break;
    }
  }

  if (!scheduledRow && predNorm != null) {
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
      scheduledRow?.routeColor ??
      routeColor(row.feedId, routeShort, null, routeId ?? undefined),
    destination: cleanHeadsign(scheduledRow?.headsign) || "In service",
    departureTime: secToTime(schedSec % 86400),
    stopId: row.stopId,
    platform: row.feedId === "go" ? row.platform : undefined,
    delaySec,
    predictedSec: predictedSec ?? undefined,
    realtime: true,
    vehicleId: row.vehicleId,
  };
}

function enrichGoPlatforms(
  rows: DepartureInput[],
  platformByRouteSec: Map<string, string>,
): DepartureInput[] {
  const now = torontoNowSec();
  const latestByRoute = new Map<string, { sec: number; platform: string }>();
  for (const [key, platform] of platformByRouteSec) {
    const colon = key.indexOf(":");
    if (colon < 0) continue;
    const route = key.slice(0, colon);
    const sec = Number(key.slice(colon + 1));
    if (Number.isNaN(sec)) continue;
    const prev = latestByRoute.get(route);
    if (!prev || Math.abs(sec - now) < Math.abs(prev.sec - now)) {
      latestByRoute.set(route, { sec, platform });
    }
  }

  return rows.map((row) => {
    if (row.feedId !== "go" || row.platform) return row;
    const sec = normalizeServiceSec(
      row.predictedSec ?? gtfsTimeToSec(row.departureTime),
      now,
    );
    const routeKeys = new Set(
      [row.routeShort, routeTail(row.routeId)].filter(Boolean) as string[],
    );
    let bestPlat: string | undefined;
    let bestDelta = Infinity;
    for (const [key, platform] of platformByRouteSec) {
      const colon = key.indexOf(":");
      if (colon < 0) continue;
      const route = key.slice(0, colon);
      if (!routeKeys.has(route)) continue;
      const delta = Math.abs(Number(key.slice(colon + 1)) - sec);
      if (delta <= 15 * 60 && delta < bestDelta) {
        bestDelta = delta;
        bestPlat = platform;
      }
    }
    if (bestPlat) return { ...row, platform: bestPlat };

    for (const route of routeKeys) {
      const latest = latestByRoute.get(route);
      if (latest && Math.abs(latest.sec - sec) <= 15 * 60) {
        return { ...row, platform: latest.platform };
      }
    }
    return row;
  });
}

async function buildRtStopIdMaps(stop: DemoStopMeta) {
  const rtStopIdsByFeed = new Map<string, string[]>();
  const ttcRtByStopId = new Map<string, string[]>();
  let ttcRtIds: string[] | null = null;

  for (const m of stop.members) {
    if (m.feedId === "ttc") {
      if (!ttcRtIds) {
        ttcRtIds = await resolveTtcRtStopIds(stop.members.filter((x) => x.feedId === "ttc"));
        rtStopIdsByFeed.set("ttc", ttcRtIds);
      }
      if (!ttcRtByStopId.has(m.stopId)) {
        ttcRtByStopId.set(m.stopId, await resolveTtcRtStopIds([m]));
      }
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

  return {
    rtStopIdsByFeed,
    ttcRtByStopId,
    allowedTtcRtStopIds: new Set(ttcRtIds ?? []),
  };
}

export async function buildDemoStopDepartures(
  groupId: string,
  stop: DemoStopMeta,
  opts?: { quick?: boolean },
): Promise<{ name: string; rows: DepartureRowOut[] }> {
  const schedule = await loadBoardSchedule(groupId, stop);

  if (opts?.quick) {
    return {
      name: stop.name,
      rows: filterUpcomingDepartures(scheduleRowsToInputs(schedule)),
    };
  }

  await loadFixturesTree();
  const usedRtTrips = new Set<string>();

  await ensureRtCacheWithin(8000);
  const { rtStopIdsByFeed, ttcRtByStopId, allowedTtcRtStopIds } =
    await buildRtStopIdMaps(stop);

  const inputs: DepartureInput[] = [];

  if (isRtCacheWarm()) {
    for (const [feedId, rtStopIds] of rtStopIdsByFeed) {
      for (const extra of getRtPredictionsForStop(feedId, rtStopIds, new Set())) {
        if (feedId === "ttc" && !allowedTtcRtStopIds.has(extra.stopId)) continue;
        const alreadyScheduled = schedule.some(
          (s) =>
            s.feedId === extra.feedId &&
            (s.tripId === extra.tripId ||
              (extra.feedId === "go" && goTripsMatch(s.tripId, extra.tripId))),
        );
        if (alreadyScheduled) continue;
        const row = rtPredictionToDeparture(extra, schedule);
        if (!row) continue;
        usedRtTrips.add(`${row.feedId}:${row.tripId}`);
        inputs.push(row);
      }
    }
  }

  const goPlatformByRouteSec = new Map<string, string>();

  for (const r of schedule) {
    const rtIds =
      r.feedId === "ttc"
        ? (ttcRtByStopId.get(r.stopId) ?? [r.stopId])
        : r.feedId === "go"
          ? resolveGoRtStopIds(r.stopId, stop.members)
          : [r.stopId];
    const schedSec = gtfsTimeToSec(r.departureTime);
    const rt = isRtCacheWarm()
      ? mergeRtIntoDeparture(r.feedId, r.tripId, r.stopId, schedSec, rtIds, {
          routeId: r.routeId,
          routeShort: r.routeShort,
          usedRtTrips,
        })
      : { liveTripId: undefined, delaySec: undefined, predictedSec: undefined, realtime: false, platform: undefined, vehicleId: undefined };
    inputs.push({
      tripId: rt.liveTripId ?? r.tripId,
      scheduleTripId: r.tripId,
      feedId: r.feedId,
      routeId: r.routeId,
      routeShort: r.routeShort,
      routeColor: r.routeColor,
      destination: cleanHeadsign(r.headsign),
      departureTime: r.departureTime,
      stopId: r.stopId,
      platform: r.feedId === "go" ? formatGoPlatform(rt.platform) : undefined,
      delaySec: rt.delaySec,
      predictedSec: rt.predictedSec,
      realtime: rt.realtime,
      vehicleId: rt.vehicleId,
    });
  }

  const deduped = dedupeDepartures(enrichGoPlatforms(inputs, goPlatformByRouteSec));

  const scheduleHeadsigns = new Map<string, string>();
  for (const row of schedule) {
    const hs = row.headsign?.trim();
    if (!hs) continue;
    scheduleHeadsigns.set(`${row.feedId}:${row.tripId}`, hs);
  }

  function headsignFromSchedule(row: DepartureInput): string | undefined {
    return (
      scheduleHeadsigns.get(`${row.feedId}:${row.tripId}`) ??
      (row.scheduleTripId
        ? scheduleHeadsigns.get(`${row.feedId}:${row.scheduleTripId}`)
        : undefined)
    );
  }

  const missingByFeed = new Map<string, Set<string>>();
  for (const row of deduped) {
    if (headsignFromSchedule(row)) continue;
    if (row.realtime || needsHeadsignLookup(row.destination)) {
      if (!missingByFeed.has(row.feedId)) missingByFeed.set(row.feedId, new Set());
      missingByFeed.get(row.feedId)!.add(row.scheduleTripId ?? row.tripId);
    }
  }

  const resolved = new Map<string, string | null>();
  if (missingByFeed.size) {
    await Promise.all(
      [...missingByFeed.entries()].map(async ([feedId, tripIds]) => {
        await preloadTripHeadsignIndex(feedId);
        const hits = await tripHeadsigns(feedId, [...tripIds]);
        for (const [tripId, hs] of hits) {
          resolved.set(`${feedId}:${tripId}`, hs);
        }
      }),
    );
  }

  const withHeadsigns = deduped.map((row) => {
    const hs =
      headsignFromSchedule(row) ??
      resolved.get(`${row.feedId}:${row.scheduleTripId ?? row.tripId}`) ??
      resolved.get(`${row.feedId}:${row.tripId}`);
    if (!hs) return row;
    if (!row.realtime && !needsHeadsignLookup(row.destination)) return row;
    return { ...row, destination: cleanHeadsign(hs) };
  });

  return {
    name: stop.name,
    rows: filterUpcomingDepartures(withHeadsigns),
  };
}
