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
import { isUnixTimestamp, unixToTorontoSec } from "./calendar";

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
let lastRefresh = 0;
let refreshing: Promise<void> | null = null;

function tripKey(feedId: string, tripId: string) {
  return `${feedId}:${tripId}`;
}

function stopTripKey(feedId: string, tripId: string, stopId: string) {
  return `${feedId}:${tripId}:${stopId}`;
}

function platformFromUpdate(u: RtTripUpdate): string | undefined {
  return u.platform;
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
  const stopIdSet = new Set(stopIds);
  const byTrip = new Map<string, RtStopPrediction>();

  for (const [key, rt] of stopTripMap) {
    const [f, tripId, stopId] = key.split(":");
    if (f !== feedId || !tripId || !stopId || !stopIdSet.has(stopId)) continue;
    if (excludeTrips.has(`${feedId}:${tripId}`) || excludeTrips.has(tripId)) continue;
    if (rt.delaySec == null && rt.predictedSec == null) continue;

    const tripRt = getTripRt(feedId, tripId);
    const vehicle = getVehicleForTrip(feedId, tripId);
    byTrip.set(tripId, {
      feedId,
      tripId,
      stopId,
      delaySec: rt.delaySec ?? tripRt?.delaySec,
      predictedSec: rt.predictedSec,
      vehicleId: tripRt?.vehicleId ?? vehicle?.vehicleId,
      routeId: tripRt?.routeId ?? vehicle?.routeId,
    });
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
): {
  delaySec?: number;
  predictedSec?: number;
  platform?: string;
  vehicleId?: string;
  realtime: boolean;
} {
  const stopIds = stopId ? [stopId, ...altStopIds.filter((id) => id !== stopId)] : altStopIds;
  const stopRt = stopIds.length
    ? getStopTripRtAny(feedId, tripId, stopIds)
    : undefined;
  const tripRt = getTripRt(feedId, tripId);
  const vehicle = getVehicleForTrip(feedId, tripId);

  let delaySec =
    stopRt?.delaySec ?? tripRt?.delaySec ?? vehicle?.delaySec ?? undefined;

  let predictedSec: number | undefined;
  if (stopRt?.predictedSec != null) {
    predictedSec = isUnixTimestamp(stopRt.predictedSec)
      ? unixToTorontoSec(stopRt.predictedSec)
      : stopRt.predictedSec;
  } else if (tripRt?.predictedSec != null) {
    predictedSec = isUnixTimestamp(tripRt.predictedSec)
      ? unixToTorontoSec(tripRt.predictedSec)
      : tripRt.predictedSec;
  } else if (delaySec != null) {
    predictedSec = schedSec + delaySec;
  }

  if (predictedSec != null && delaySec == null) {
    const drift = predictedSec - schedSec;
    if (Math.abs(drift) >= 30) delaySec = drift;
  }

  const vehicleId = tripRt?.vehicleId ?? vehicle?.vehicleId;
  const hasStopUpdate =
    stopRt != null && (stopRt.delaySec != null || stopRt.predictedSec != null);
  const hasTripUpdate =
    tripRt != null && (tripRt.delaySec != null || tripRt.predictedSec != null);
  const hasVehicle = vehicle != null;
  const realtime =
    hasStopUpdate ||
    hasTripUpdate ||
    hasVehicle ||
    (delaySec != null && delaySec !== 0);

  return {
    delaySec,
    predictedSec,
    platform: stopRt?.platform ?? tripRt?.platform,
    vehicleId,
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
