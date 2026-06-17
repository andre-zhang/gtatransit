import {
  GO_RT_API,
  UP_RT_API,
  RT_FEEDS,
  decodeFeed,
  fetchRt,
  metrolinxApiUrl,
  metrolinxJsonError,
  parseMetrolinxJsonTripUpdates,
  parseMetrolinxJsonVehicles,
  parseTripUpdates,
  parseVehicles,
  type RtTripUpdate,
  type RtVehicle,
} from "@gta/gtfs-rt";
import { isDatabaseConfigured } from "@gta/db";
import { useDemoFixtures } from "./demo-mode";
import { persistRtSnapshot } from "./rt-persist";
import {
  isUnixTimestamp,
  normalizeServiceSec,
  torontoNowSec,
  unixToTorontoSec,
} from "./calendar";
import { formatGoPlatform, goTripSuffix, goTripsMatch } from "./go-stop-aliases";
import { fetchGoNextService } from "./go-metrolinx-rest";
import { routesMatch } from "./route-match";

const RT_STALE_MS = 5 * 60_000;
/** Major GO stop codes polled via REST when GTFS-RT is unavailable. */
const GO_REST_HUBS = ["UN", "OS", "BR", "ML", "RH", "KP", "CO", "DI"];

type StopRt = {
  delaySec?: number;
  predictedSec?: number;
  platform?: string;
  updatedAt: number;
};

type TripRt = StopRt & { routeId?: string; vehicleId?: string };

const TTL_MS = 30_000;
const tripMap = new Map<string, TripRt>();
const stopTripMap = new Map<string, StopRt>();
const vehicleMap = new Map<string, RtVehicle & { updatedAt: number }>();
const predictionsByStop = new Map<string, IndexedPrediction[]>();
let lastRefresh = 0;
let refreshing: Promise<void> | null = null;
export function normalizeMetrolinxKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key || undefined;
}

function readMetrolinxKey(): string | undefined {
  return normalizeMetrolinxKey(process.env.METROLINX_API_KEY);
}

let goRtEnabled = Boolean(readMetrolinxKey());
let goRtLastOk = 0;
let goRtLastError: string | null = null;
let goRtStats = { tripUpdates: 0, vehicles: 0, predictions: 0 };
let goRtSource: "gtfs-rt" | "rest" | null = null;

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
  feedId: string,
  rtRoute: string | undefined,
  routeId: string | undefined,
  routeShort: string | undefined,
): boolean {
  if (!routeId && !routeShort) return false;
  return routesMatch(feedId, routeId ?? routeShort ?? "", routeShort, rtRoute);
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
    if (predictedSec == null && rt.delaySec != null) {
      predictedSec = tripRt?.predictedSec;
    }
    if (predictedSec == null && rt.delaySec != null) {
      predictedSec = torontoNowSec() + rt.delaySec;
    }
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
  const targetSec = normalizeServiceSec(schedSec, now);
  let best: IndexedPrediction | undefined;
  let bestDelta = Infinity;

  for (const stopId of stopIds) {
    const preds = predictionsByStop.get(`${feedId}:${stopId}`) ?? [];
    for (const p of preds) {
      const usedKey = `${feedId}:${p.tripId}`;
      if (usedRtTrips.has(usedKey) || usedRtTrips.has(p.tripId)) continue;
      if (!routeMatches(feedId, p.routeId, routeId, routeShort)) continue;
      const predSec = normalizeServiceSec(p.predictedSec, now);
      const delta = Math.abs(predSec - targetSec);
      if (delta > FUZZY_MATCH_SEC || delta >= bestDelta) continue;
      best = p;
      bestDelta = delta;
    }
  }

  return best;
}

function isFreshRt(entry: { updatedAt: number } | undefined, now = Date.now()): boolean {
  return entry != null && now - entry.updatedAt < RT_STALE_MS;
}

function clearRtMaps() {
  tripMap.clear();
  stopTripMap.clear();
  vehicleMap.clear();
  predictionsByStop.clear();
}

async function pollGoRest(key: string, now: number): Promise<number> {
  let tripUpdates = 0;
  const errors: string[] = [];

  const hubResults = await Promise.all(
    GO_REST_HUBS.map(async (stopCode) => ({
      stopCode,
      ...(await fetchGoNextService(stopCode, key)),
    })),
  );

  for (const { stopCode, rows, error } of hubResults) {
    if (error) {
      errors.push(`${stopCode}:${error}`);
      continue;
    }
    for (const row of rows) {
      tripUpdates++;
      const platform = row.platform;
      const entry: StopRt = {
        predictedSec: row.predictedSec,
        platform,
        updatedAt: now,
      };
      stopTripMap.set(stopTripKey("go", row.tripId, stopCode), entry);
      const tk = tripKey("go", row.tripId);
      const prev = tripMap.get(tk) ?? { updatedAt: now };
      tripMap.set(tk, {
        ...prev,
        routeId: row.routeShort,
        predictedSec: row.predictedSec,
        platform: platform ?? prev.platform,
        updatedAt: now,
      });
    }
  }

  if (tripUpdates > 0) {
    goRtSource = "rest";
    goRtLastOk = now;
    goRtLastError = errors.length ? errors.join("; ") : null;
    goRtStats = { ...goRtStats, tripUpdates, vehicles: goRtStats.vehicles };
    return tripUpdates;
  }

  if (errors.length) {
    goRtLastError = [goRtLastError, errors.join("; ")].filter(Boolean).join("; ");
  }
  return 0;
}

async function pollMetrolinxFeed(
  feedId: "go" | "up",
  api: { tripUpdates: string; vehiclePositions: string },
  key: string,
) {
  const now = Date.now();
  let sawData = false;
  let tripUpdates = 0;
  let vehicles = 0;
  const errors: string[] = [];

  for (const [kind, path] of [
    ["vehicles", api.vehiclePositions],
    ["trips", api.tripUpdates],
  ] as const) {
    try {
      const url = metrolinxApiUrl(path, key);
      const res = await fetch(url, { next: { revalidate: 0 } });
      if (!res.ok) {
        errors.push(`${feedId}:${kind}:${res.status}`);
        continue;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) {
        errors.push(`${feedId}:${kind}:empty`);
        continue;
      }
      const head = new Uint8Array(buf)[0]!;
      let vehicleRows: RtVehicle[] = [];
      let updateRows: RtTripUpdate[] = [];
      if (head === 0x7b || head === 0x5b) {
        const json: unknown = JSON.parse(new TextDecoder().decode(buf));
        const jsonErr = metrolinxJsonError(json);
        if (jsonErr) {
          errors.push(`${feedId}:${kind}:${jsonErr}`);
          continue;
        }
        if (kind === "vehicles") {
          vehicleRows = parseMetrolinxJsonVehicles(feedId, json);
        } else {
          updateRows = parseMetrolinxJsonTripUpdates(feedId, json);
        }
      } else if (head === 0x3c) {
        errors.push(`${feedId}:${kind}:html`);
        continue;
      } else {
        const msg = decodeFeed(buf);
        if (kind === "vehicles") {
          vehicleRows = parseVehicles(feedId, msg);
        } else {
          updateRows = parseTripUpdates(feedId, msg);
        }
      }
      sawData = true;

      if (kind === "vehicles") {
        for (const v of vehicleRows) {
          if (v.lat == null || v.lon == null) continue;
          vehicles++;
          const tk = v.tripId ? tripKey(feedId, v.tripId) : null;
          const routeId = v.routeId ?? (tk ? tripMap.get(tk)?.routeId : undefined);
          const enriched = routeId && !v.routeId ? { ...v, routeId } : v;
          vehicleMap.set(`${feedId}:${v.vehicleId}`, { ...enriched, updatedAt: now });
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
      } else {
        for (const u of updateRows) {
          tripUpdates++;
          const platform = platformFromUpdate(u);
          const entry: StopRt = {
            delaySec: u.delaySec,
            predictedSec: u.departureTime ?? u.arrivalTime,
            platform,
            updatedAt: now,
          };
          stopTripMap.set(stopTripKey(feedId, u.tripId, u.stopId), entry);
          const tk = tripKey(feedId, u.tripId);
          const prev = tripMap.get(tk) ?? { updatedAt: now };
          tripMap.set(tk, {
            ...prev,
            routeId: u.routeId ?? prev.routeId,
            delaySec: u.delaySec ?? prev.delaySec,
            predictedSec: u.departureTime ?? prev.predictedSec,
            platform: platform ?? prev.platform,
            updatedAt: now,
          });
        }
      }
    } catch (e) {
      errors.push(`${feedId}:${kind}:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (sawData) {
    goRtSource = "gtfs-rt";
    goRtLastOk = now;
    goRtLastError = errors.length ? errors.join("; ") : null;
    goRtStats = {
      ...goRtStats,
      tripUpdates: goRtStats.tripUpdates + tripUpdates,
      vehicles: goRtStats.vehicles + vehicles,
    };
  } else if (errors.length) {
    goRtLastError = [goRtLastError, errors.join("; ")].filter(Boolean).join("; ");
  }

  return { sawData, tripUpdates, vehicles };
}

async function pollGo(key: string) {
  const now = Date.now();
  const result = await pollMetrolinxFeed("go", GO_RT_API, key);
  if (result.sawData && result.tripUpdates === 0) {
    await pollGoRest(key, now);
  } else if (!result.sawData) {
    await pollGoRest(key, now);
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
          platform: u.platform,
          updatedAt: now,
        });
        const tk = tripKey(feedId, u.tripId);
        const prev = tripMap.get(tk) ?? { updatedAt: now };
        tripMap.set(tk, {
          ...prev,
          routeId: u.routeId ?? prev.routeId,
          vehicleId: u.vehicleId ?? prev.vehicleId,
          delaySec: u.delaySec ?? prev.delaySec,
          predictedSec: u.departureTime ?? prev.predictedSec,
          platform: u.platform ?? prev.platform,
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
        if (v.tripId) {
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
        if (v.lat == null || v.lon == null) continue;
        const tk = v.tripId ? tripKey(feedId, v.tripId) : null;
        const routeId = v.routeId ?? (tk ? tripMap.get(tk)?.routeId : undefined);
        const enriched = routeId && !v.routeId ? { ...v, routeId } : v;
        vehicleMap.set(`${feedId}:${v.vehicleId}`, { ...enriched, updatedAt: now });
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
  const goKey = readMetrolinxKey();
  goRtEnabled = Boolean(goKey);

  if (!force && Date.now() - lastRefresh < TTL_MS && tripMap.size > 0) {
    if (goKey && Date.now() - goRtLastOk > TTL_MS) {
      await pollGo(goKey);
      await pollMetrolinxFeed("up", UP_RT_API, goKey);
      rebuildStopPredictionsIndex();
      goRtStats = {
        ...goRtStats,
        predictions: [...predictionsByStop.keys()].filter((k) => k.startsWith("go:"))
          .length,
      };
    }
    return;
  }
  if (refreshing) return refreshing;

  refreshing = (async () => {
    clearRtMaps();
    await Promise.all(Object.keys(RT_FEEDS).map((feedId) => pollFeed(feedId)));
    if (goKey) {
      await pollGo(goKey);
      await pollMetrolinxFeed("up", UP_RT_API, goKey);
    }

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
    goRtStats = {
      ...goRtStats,
      predictions: [...predictionsByStop.keys()].filter((k) => k.startsWith("go:"))
        .length,
    };
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
    if (hit && isFreshRt(hit)) return hit;
  }

  if (feedId === "go") {
    const suffix = goTripSuffix(tripId);
    for (const [key, rt] of stopTripMap) {
      const parts = key.split(":");
      const keyFeed = parts[0];
      const keyTrip = parts[1];
      const keyStop = parts.slice(2).join(":");
      if (keyFeed !== feedId || !keyTrip || !keyStop) continue;
      if (goTripSuffix(keyTrip) !== suffix) continue;
      if (!stopIds.includes(keyStop)) continue;
      if (!isFreshRt(rt)) continue;
      return rt;
    }
  }

  return undefined;
}

function platformForTripAtStops(
  feedId: string,
  tripId: string,
  stopIds: string[],
): string | undefined {
  const stopRt = getStopTripRtAny(feedId, tripId, stopIds);
  const tripRt = getTripRt(feedId, tripId);
  const raw = stopRt?.platform ?? tripRt?.platform;
  if (feedId === "go") return formatGoPlatform(raw);
  return raw;
}

export type RtStopPrediction = {
  feedId: string;
  tripId: string;
  stopId: string;
  delaySec?: number;
  predictedSec?: number;
  vehicleId?: string;
  routeId?: string;
  platform?: string;
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
        platform:
          feedId === "go" ? formatGoPlatform(p.platform) : p.platform,
      });
    }
  }

  return [...byTrip.values()];
}

function getVehicleIdForTrip(feedId: string, tripId: string): string | undefined {
  const tripRt = getTripRt(feedId, tripId);
  if (tripRt?.vehicleId) return tripRt.vehicleId;
  const cutoff = Date.now() - 5 * 60_000;
  for (const v of vehicleMap.values()) {
    if (v.feedId === feedId && v.tripId === tripId && v.updatedAt >= cutoff) {
      return v.vehicleId;
    }
  }
  return undefined;
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
  let stopRt = stopIds.length
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

  let fuzzyPlatform: string | undefined;
  // Only attach live data when the RT trip matches this scheduled trip — never
  // fuzzy-match a different running trip onto future scheduled departures.
  if (!hasExact && opts?.usedRtTrips) {
    for (const sid of stopIds) {
      const preds = predictionsByStop.get(`${feedId}:${sid}`) ?? [];
      for (const p of preds) {
        if (opts.usedRtTrips.has(`${feedId}:${p.tripId}`)) continue;
        if (feedId === "go" && !goTripsMatch(tripId, p.tripId)) continue;
        if (feedId !== "go" && p.tripId !== tripId) continue;
        liveTripId = p.tripId;
        opts.usedRtTrips.add(`${feedId}:${p.tripId}`);
        tripRt = getTripRt(feedId, p.tripId);
        vehicle = getVehicleForTrip(feedId, p.tripId);
        stopRt = getStopTripRtAny(feedId, p.tripId, stopIds) ?? stopRt;
        delaySec =
          p.delaySec ?? stopRt?.delaySec ?? tripRt?.delaySec ?? vehicle?.delaySec;
        predictedSec = p.predictedSec;
        if (p.platform) {
          fuzzyPlatform =
            feedId === "go" ? formatGoPlatform(p.platform) : p.platform;
        }
        break;
      }
      if (liveTripId) break;
    }
  }

  if (predictedSec != null) {
    const drift = predictedSec - schedSec;
    if (delaySec == null || Math.abs(drift) > Math.abs(delaySec)) {
      delaySec = drift;
    }
  }

  const vehicleId =
    tripRt?.vehicleId ?? vehicle?.vehicleId ?? getVehicleIdForTrip(feedId, liveTripId ?? tripId);
  if (liveTripId != null && !fuzzyPlatform) {
    for (const sid of stopIds) {
      const pred = predictionsByStop
        .get(`${feedId}:${sid}`)
        ?.find(
          (p) =>
            p.tripId === liveTripId ||
            (feedId === "go" && liveTripId && goTripsMatch(liveTripId, p.tripId)),
        );
      if (pred?.platform) {
        fuzzyPlatform =
          feedId === "go" ? formatGoPlatform(pred.platform) : pred.platform;
        break;
      }
    }
  }

  const hasStopUpdate =
    stopRt != null && (stopRt.delaySec != null || stopRt.predictedSec != null);
  const hasTripUpdate =
    tripRt != null && (tripRt.delaySec != null || tripRt.predictedSec != null);
  const hasVehicle = vehicle != null;
  const realtime =
    liveTripId != null ||
    hasStopUpdate ||
    hasTripUpdate ||
    (hasVehicle && (hasStopUpdate || hasTripUpdate || stopRt != null || tripRt != null)) ||
    (delaySec != null && predictedSec != null && (stopRt != null || tripRt != null));

  const rawPlatform = stopRt?.platform ?? tripRt?.platform ?? fuzzyPlatform;
  const platform =
    feedId === "go"
      ? formatGoPlatform(rawPlatform) ??
        (liveTripId != null
          ? platformForTripAtStops(feedId, liveTripId, stopIds)
          : undefined)
      : rawPlatform;

  return {
    delaySec,
    predictedSec,
    platform,
    vehicleId,
    liveTripId,
    realtime,
  };
}

function snapshotTripUpdates(): RtTripUpdate[] {
  const out: RtTripUpdate[] = [];
  for (const [key, rt] of stopTripMap) {
    const parts = key.split(":");
    const feedId = parts[0];
    const tripId = parts[1];
    const stopId = parts.slice(2).join(":");
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

/** True when in-memory RT was refreshed recently. */
export function isRtCacheWarm(): boolean {
  return tripMap.size > 0 && Date.now() - lastRefresh < TTL_MS;
}

/** Refresh RT only when the cache is empty or stale. */
export async function ensureRtCache(force = false): Promise<void> {
  if (!force && isRtCacheWarm()) return;
  await refreshRtCache(force);
}

/** Wait for RT refresh but don't block the board longer than maxMs. */
export async function ensureRtCacheWithin(maxMs: number, force = false): Promise<void> {
  if (!force && isRtCacheWarm()) return;
  await Promise.race([
    ensureRtCache(force),
    new Promise<void>((resolve) => setTimeout(resolve, maxMs)),
  ]);
}

/** ISO timestamp of the most recent successful RT poll (for UI freshness). */
export function getRtLastUpdatedIso(): string | null {
  const ts = Math.max(goRtLastOk, lastRefresh);
  return ts > 0 ? new Date(ts).toISOString() : null;
}

export function getGoRtStatus(): {
  configured: boolean;
  keyLength: number;
  source: "gtfs-rt" | "rest" | null;
  active: boolean;
  lastOk: string | null;
  lastError: string | null;
  tripUpdates: number;
  vehicles: number;
  predictions: number;
} {
  const key = readMetrolinxKey();
  const configured = Boolean(key);
  const fresh = goRtLastOk > 0 && Date.now() - goRtLastOk < 5 * 60_000;
  const hasVehicles = [...vehicleMap.values()].some((v) => v.feedId === "go");
  const hasPredictions = [...predictionsByStop.keys()].some((k) =>
    k.startsWith("go:"),
  );
  const active = configured && fresh && (hasVehicles || hasPredictions);
  return {
    configured,
    keyLength: key?.length ?? 0,
    source: goRtSource,
    active,
    lastOk: goRtLastOk ? new Date(goRtLastOk).toISOString() : null,
    lastError: goRtLastError,
    ...goRtStats,
  };
}

export function getRtVehicles(): RtVehicle[] {
  const cutoff = Date.now() - 5 * 60_000;
  return [...vehicleMap.values()]
    .filter((v) => v.updatedAt >= cutoff && v.lat != null && v.lon != null)
    .map(({ updatedAt: _, ...v }) => {
      if (!v.routeId && v.tripId) {
        const tripRt = tripMap.get(tripKey(v.feedId, v.tripId));
        if (tripRt?.routeId) return { ...v, routeId: tripRt.routeId };
      }
      return v;
    });
}

/** Active vehicle serving a route (for stops without stop-level trip updates). */
export function getActiveVehicleForRoute(
  feedId: string,
  routeId: string | undefined,
  routeShort: string | undefined,
): RtVehicle | undefined {
  for (const v of getRtVehicles()) {
    if (v.feedId !== feedId || !v.tripId) continue;
    if (routeMatches(feedId, v.routeId, routeId, routeShort)) return v;
  }
  return undefined;
}

export function getRtVehicle(
  feedId: string,
  vehicleId: string,
): (RtVehicle & { updatedAt?: number }) | undefined {
  const v = vehicleMap.get(`${feedId}:${vehicleId}`);
  if (!v || v.lat == null || v.lon == null) return undefined;
  if (v.updatedAt < Date.now() - 5 * 60_000) return undefined;
  return v;
}

export function getTripStopUpdates(
  feedId: string,
  tripId: string,
): Array<{
  stopId: string;
  delaySec?: number;
  predictedSec?: number;
  platform?: string;
}> {
  const prefix = `${feedId}:${tripId}:`;
  const out: Array<{
    stopId: string;
    delaySec?: number;
    predictedSec?: number;
    platform?: string;
  }> = [];

  for (const [key, rt] of stopTripMap) {
    if (!key.startsWith(prefix)) continue;
    const stopId = key.slice(prefix.length);
    let predictedSec = rt.predictedSec;
    if (predictedSec != null) predictedSec = normalizePredictedSec(predictedSec);
    out.push({
      stopId,
      delaySec: rt.delaySec,
      predictedSec,
      platform: rt.platform,
    });
  }

  out.sort((a, b) => (a.predictedSec ?? Infinity) - (b.predictedSec ?? Infinity));
  return out;
}

export function getTripDelaySec(feedId: string, tripId: string): number | undefined {
  const stopRt = [...stopTripMap.entries()]
    .filter(([key]) => key.startsWith(`${feedId}:${tripId}:`))
    .map(([, rt]) => rt)
    .find((rt) => rt.delaySec != null);
  if (stopRt?.delaySec != null) return stopRt.delaySec;
  const tripRt = getTripRt(feedId, tripId);
  if (tripRt?.delaySec != null) return tripRt.delaySec;
  const vehicle = getVehicleForTrip(feedId, tripId);
  return vehicle?.delaySec;
}
