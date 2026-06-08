import {
  RT_FEEDS,
  fetchRt,
  parseTripUpdates,
  parseVehicles,
  type RtTripUpdate,
  type RtVehicle,
} from "@gta/gtfs-rt";
import { isDatabaseConfigured } from "@gta/db";
import { useDemoFixtures } from "./demo-mode";
import { persistRtSnapshot } from "./rt-persist";
import { isUnixTimestamp, unixToTorontoSec, torontoNowSec } from "./calendar";

type StopRt = {
  delaySec?: number;
  predictedSec?: number;
  platform?: string;
  updatedAt: number;
};

type TripRt = StopRt & { routeId?: string; vehicleId?: string };

const TTL_MS = 20_000;
const tripMap = new Map<string, TripRt>();
const stopTripMap = new Map<string, StopRt>();
const vehicleMap = new Map<string, RtVehicle & { updatedAt: number }>();
const predictionsByStop = new Map<string, IndexedPrediction[]>();
let lastRefresh = 0;
let refreshing: Promise<void> | null = null;

type IndexedPrediction = {
  feedId: string;
  tripId: string;
  stopId: string;
  routeId?: string;
  delaySec?: number;
  predictedSec: number;
  vehicleId?: string;
  platform?: string;
};

const FUZZY_MATCH_SEC = 50 * 60;

function tripKey(feedId: string, tripId: string) {
  return `${feedId}:${tripId}`;
}

function stopTripKey(feedId: string, tripId: string, stopId: string) {
  return `${feedId}:${tripId}:${stopId}`;
}

function normalizePredictedSec(raw: number): number {
  return isUnixTimestamp(raw) ? unixToTorontoSec(raw) : raw;
}

function routeMatches(
  rtRoute: string | undefined,
  routeId: string | undefined,
  routeShort: string | undefined,
): boolean {
  if (!rtRoute) return false;
  return (
    rtRoute === routeId ||
    rtRoute === routeShort ||
    routeId === rtRoute ||
    routeShort === rtRoute
  );
}

function normalizeDepSec(schedSec: number, now: number): number {
  let depSec = schedSec;
  if (depSec < now - 120) depSec += 86400;
  if (depSec < now - 120) depSec += 86400;
  return depSec;
}

function rebuildStopPredictionsIndex() {
  predictionsByStop.clear();
  for (const [key, rt] of stopTripMap) {
    const parts = key.split(":");
    const feedId = parts[0];
    const tripId = parts[1];
    const stopId = parts.slice(2).join(":");
    if (!feedId || !tripId || !stopId) continue;
    if (rt.predictedSec == null && rt.delaySec == null) continue;

    const tripRt = tripMap.get(tripKey(feedId, tripId));
    const vehicle = getVehicleForTrip(feedId, tripId);
    const routeId = tripRt?.routeId ?? vehicle?.routeId;
    let predictedSec = rt.predictedSec;
    if (predictedSec == null && rt.delaySec != null) continue;
    if (predictedSec == null) continue;
    predictedSec = normalizePredictedSec(predictedSec);

    const idxKey = `${feedId}:${stopId}`;
    if (!predictionsByStop.has(idxKey)) predictionsByStop.set(idxKey, []);
    predictionsByStop.get(idxKey)!.push({
      feedId,
      tripId,
      stopId,
      routeId,
      delaySec: rt.delaySec,
      predictedSec,
      vehicleId: tripRt?.vehicleId ?? vehicle?.vehicleId,
      platform: rt.platform ?? tripRt?.platform,
    });
  }

  for (const preds of predictionsByStop.values()) {
    preds.sort((a, b) => a.predictedSec - b.predictedSec);
  }
}

function platformFromUpdate(u: RtTripUpdate): string | undefined {
  return u.platform;
}

function findFuzzyRtMatch(
  feedId: string,
  stopIds: string[],
  routeId: string | undefined,
  routeShort: string | undefined,
  schedSec: number,
  usedRtTrips: Set<string>,
): IndexedPrediction | undefined {
  const now = torontoNowSec();
  const targetSec = normalizeDepSec(schedSec, now);
  let best: IndexedPrediction | undefined;
  let bestDelta = Infinity;

  for (const stopId of stopIds) {
    const preds = predictionsByStop.get(`${feedId}:${stopId}`) ?? [];
    for (const p of preds) {
      const usedKey = `${feedId}:${p.tripId}`;
      if (usedRtTrips.has(usedKey) || usedRtTrips.has(p.tripId)) continue;
      if (!routeMatches(p.routeId, routeId, routeShort)) continue;
      const predSec = normalizeDepSec(p.predictedSec, now);
      const delta = Math.abs(predSec - targetSec);
      if (delta > FUZZY_MATCH_SEC || delta >= bestDelta) continue;
      best = p;
      bestDelta = delta;
    }
  }

  return best;
}

async function pollGo(key: string) {
  const headers = { "Ocp-Apim-Subscription-Key": key };
  const now = Date.now();

  for (const [kind, path] of [
    ["vehicles", "GTFS/VehiclePositions"],
    ["trips", "GTFS/TripUpdates"],
  ] as const) {
    try {
      const url = `https://api.openmetrolinx.com/OpenDataAPI/${path}`;
      const res = await fetch(url, { headers, next: { revalidate: 0 } });
      if (!res.ok) continue;
      const { decodeFeed } = await import("@gta/gtfs-rt");
      const msg = decodeFeed(await res.arrayBuffer());

      if (kind === "vehicles") {
        for (const v of parseVehicles("go", msg)) {
          if (v.lat == null || v.lon == null) continue;
          vehicleMap.set(`go:${v.vehicleId}`, { ...v, updatedAt: now });
          if (!v.tripId) continue;
          const k = tripKey("go", v.tripId);
          const prev = tripMap.get(k) ?? { updatedAt: now };
          tripMap.set(k, {
            ...prev,
            routeId: v.routeId ?? prev.routeId,
            vehicleId: v.vehicleId,
            delaySec: v.delaySec ?? prev.delaySec,
            updatedAt: now,
          });
        }
      } else {
        for (const u of parseTripUpdates("go", msg)) {
          const platform = platformFromUpdate(u);
          const entry: StopRt = {
            delaySec: u.delaySec,
            predictedSec: u.departureTime ?? u.arrivalTime,
            platform,
            updatedAt: now,
          };
          stopTripMap.set(stopTripKey("go", u.tripId, u.stopId), entry);
          const tk = tripKey("go", u.tripId);
          const prev = tripMap.get(tk) ?? { updatedAt: now };
          tripMap.set(tk, {
            ...prev,
            delaySec: u.delaySec ?? prev.delaySec,
            predictedSec: u.departureTime ?? prev.predictedSec,
            platform: platform ?? prev.platform,
            updatedAt: now,
          });
        }
      }
    } catch {
      /* ignore per-feed errors */
    }
  }
}

async function pollFeed(feedId: string) {
  const cfg = RT_FEEDS[feedId];
  if (!cfg) return;
  const now = Date.now();

  if (cfg.tripUpdates) {
    try {
      const msg = await fetchRt(cfg.tripUpdates, cfg.headers);
      for (const u of parseTripUpdates(feedId, msg)) {
        stopTripMap.set(stopTripKey(feedId, u.tripId, u.stopId), {
          delaySec: u.delaySec,
          predictedSec: u.departureTime ?? u.arrivalTime,
          updatedAt: now,
        });
        const tk = tripKey(feedId, u.tripId);
        const prev = tripMap.get(tk) ?? { updatedAt: now };
        tripMap.set(tk, {
          ...prev,
          routeId: u.routeId ?? prev.routeId,
          delaySec: u.delaySec ?? prev.delaySec,
          predictedSec: u.departureTime ?? prev.predictedSec,
          updatedAt: now,
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (cfg.vehicles) {
    try {
      const msg = await fetchRt(cfg.vehicles, cfg.headers);
      for (const v of parseVehicles(feedId, msg)) {
        if (v.lat == null || v.lon == null) continue;
        vehicleMap.set(`${feedId}:${v.vehicleId}`, { ...v, updatedAt: now });
        if (!v.tripId) continue;
        const k = tripKey(feedId, v.tripId);
        const prev = tripMap.get(k) ?? { updatedAt: now };
        tripMap.set(k, {
          ...prev,
          routeId: v.routeId ?? prev.routeId,
          vehicleId: v.vehicleId,
          delaySec: v.delaySec ?? prev.delaySec,
          updatedAt: now,
        });
      }
    } catch {
      /* ignore */
    }
  }
}

export async function refreshRtCache(force = false) {
  if (!force && Date.now() - lastRefresh < TTL_MS && tripMap.size > 0) return;
  if (refreshing) return refreshing;

  refreshing = (async () => {
    for (const feedId of Object.keys(RT_FEEDS)) {
      await pollFeed(feedId);
    }
    const goKey = process.env.METROLINX_API_KEY;
    if (goKey) await pollGo(goKey);

    if (isDatabaseConfigured() && !(await useDemoFixtures())) {
      try {
        await persistRtSnapshot(
          [...vehicleMap.values()].filter((v) => v.lat != null && v.lon != null),
          snapshotTripUpdates(),
        );
      } catch {
        /* Neon may be linked but empty/unreachable — keep in-memory RT for this request */
      }
    }

    rebuildStopPredictionsIndex();
    lastRefresh = Date.now();
    refreshing = null;
  })();

  return refreshing;
}

export function getTripRt(feedId: string, tripId: string): TripRt | undefined {
  return tripMap.get(tripKey(feedId, tripId));
}

export function getStopTripRt(
  feedId: string,
  tripId: string,
  stopId: string,
): StopRt | undefined {
  const direct = stopTripMap.get(stopTripKey(feedId, tripId, stopId));
  if (direct) return direct;
  return undefined;
}

function getStopTripRtAny(
  feedId: string,
  tripId: string,
  stopIds: string[],
): StopRt | undefined {
  for (const stopId of stopIds) {
    const hit = stopTripMap.get(stopTripKey(feedId, tripId, stopId));
    if (hit) return hit;
  }
  return undefined;
}

export type RtStopPrediction = {
  feedId: string;
  tripId: string;
  stopId: string;
  delaySec?: number;
  predictedSec?: number;
  vehicleId?: string;
  routeId?: string;
};

/** Live predictions at a stop that may not appear in static schedule (e.g. trip id drift). */
export function getRtPredictionsForStop(
  feedId: string,
  stopIds: string[],
  excludeTrips: Set<string>,
): RtStopPrediction[] {
  const byTrip = new Map<string, RtStopPrediction>();

  for (const stopId of stopIds) {
    const preds = predictionsByStop.get(`${feedId}:${stopId}`) ?? [];
    for (const p of preds) {
      if (excludeTrips.has(`${feedId}:${p.tripId}`) || excludeTrips.has(p.tripId)) continue;
      if (byTrip.has(p.tripId)) continue;
      byTrip.set(p.tripId, {
        feedId: p.feedId,
        tripId: p.tripId,
        stopId: p.stopId,
        delaySec: p.delaySec,
        predictedSec: p.predictedSec,
        vehicleId: p.vehicleId,
        routeId: p.routeId,
      });
    }
  }

  return [...byTrip.values()];
}

function getVehicleForTrip(feedId: string, tripId: string): RtVehicle | undefined {
  const cutoff = Date.now() - 5 * 60_000;
  for (const v of vehicleMap.values()) {
    if (
      v.feedId === feedId &&
      v.tripId === tripId &&
      v.updatedAt >= cutoff &&
      v.lat != null
    ) {
      return v;
    }
  }
  return undefined;
}

export function mergeRtIntoDeparture(
  feedId: string,
  tripId: string,
  stopId: string | undefined,
  schedSec: number,
  altStopIds: string[] = [],
  opts?: {
    routeId?: string;
    routeShort?: string;
    usedRtTrips?: Set<string>;
  },
): {
  delaySec?: number;
  predictedSec?: number;
  platform?: string;
  vehicleId?: string;
  liveTripId?: string;
  realtime: boolean;
} {
  const stopIds = stopId ? [stopId, ...altStopIds.filter((id) => id !== stopId)] : altStopIds;
  const stopRt = stopIds.length
    ? getStopTripRtAny(feedId, tripId, stopIds)
    : undefined;
  let tripRt = getTripRt(feedId, tripId);
  let vehicle = getVehicleForTrip(feedId, tripId);
  let liveTripId: string | undefined;

  let delaySec =
    stopRt?.delaySec ?? tripRt?.delaySec ?? vehicle?.delaySec ?? undefined;

  let predictedSec: number | undefined;
  if (stopRt?.predictedSec != null) {
    predictedSec = normalizePredictedSec(stopRt.predictedSec);
  } else if (tripRt?.predictedSec != null) {
    predictedSec = normalizePredictedSec(tripRt.predictedSec);
  } else if (delaySec != null) {
    predictedSec = schedSec + delaySec;
  }

  const hasExact =
    stopRt != null || tripRt != null || vehicle != null || delaySec != null;

  if (!hasExact && opts?.usedRtTrips && (opts.routeId || opts.routeShort)) {
    const fuzzy = findFuzzyRtMatch(
      feedId,
      stopIds,
      opts.routeId,
      opts.routeShort,
      schedSec,
      opts.usedRtTrips,
    );
    if (fuzzy) {
      liveTripId = fuzzy.tripId;
      opts.usedRtTrips.add(`${feedId}:${fuzzy.tripId}`);
      tripRt = getTripRt(feedId, fuzzy.tripId);
      vehicle = getVehicleForTrip(feedId, fuzzy.tripId);
      delaySec = fuzzy.delaySec ?? tripRt?.delaySec ?? vehicle?.delaySec;
      predictedSec = fuzzy.predictedSec;
      if (delaySec == null && predictedSec != null) {
        const drift = predictedSec - schedSec;
        if (Math.abs(drift) >= 30) delaySec = drift;
      }
    }
  }

  if (predictedSec != null && delaySec == null) {
    const drift = predictedSec - schedSec;
    if (Math.abs(drift) >= 30) delaySec = drift;
  }

  const vehicleId = tripRt?.vehicleId ?? vehicle?.vehicleId;
  const fuzzyPlatform =
    liveTripId != null
      ? predictionsByStop
          .get(`${feedId}:${stopId ?? stopIds[0] ?? ""}`)
          ?.find((p) => p.tripId === liveTripId)?.platform
      : undefined;

  const hasStopUpdate =
    stopRt != null && (stopRt.delaySec != null || stopRt.predictedSec != null);
  const hasTripUpdate =
    tripRt != null && (tripRt.delaySec != null || tripRt.predictedSec != null);
  const hasVehicle = vehicle != null;
  const realtime =
    liveTripId != null ||
    hasStopUpdate ||
    hasTripUpdate ||
    hasVehicle ||
    (delaySec != null && predictedSec != null);

  return {
    delaySec,
    predictedSec,
    platform: stopRt?.platform ?? tripRt?.platform ?? fuzzyPlatform,
    vehicleId,
    liveTripId,
    realtime,
  };
}

function snapshotTripUpdates(): RtTripUpdate[] {
  const out: RtTripUpdate[] = [];
  for (const [key, rt] of stopTripMap) {
    const [feedId, tripId, stopId] = key.split(":");
    if (!feedId || !tripId || !stopId) continue;
    out.push({
      feedId,
      tripId,
      stopId,
      delaySec: rt.delaySec,
      arrivalTime: rt.predictedSec,
      departureTime: rt.predictedSec,
    });
  }
  return out;
}

export function getRtVehicles(): RtVehicle[] {
  const cutoff = Date.now() - 5 * 60_000;
  return [...vehicleMap.values()]
    .filter((v) => v.updatedAt >= cutoff && v.lat != null && v.lon != null)
    .map(({ updatedAt: _, ...v }) => v);
}
