import { loadDemoAssets } from "./demo-assets";
import { readDemoJsonFile } from "./demo-read";

export type TtcSurfaceStop = {
  stopCode: string | null;
  name: string;
  lat: number;
  lon: number;
};

type StopMember = { feedId: string; stopId: string };

const COORD_MATCH_M = 80;
const REGISTRY_TTL_MS = 24 * 60 * 60_000;

let registry: Record<string, TtcSurfaceStop> | null = null;
let codeToIds = new Map<string, string[]>();
let loadedAt = 0;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function ensureRegistry() {
  if (registry && Date.now() - loadedAt < REGISTRY_TTL_MS) return;
  registry = await readDemoJsonFile<Record<string, TtcSurfaceStop>>("ttc-surface-stops.json");
  codeToIds = new Map();
  for (const [stopId, meta] of Object.entries(registry)) {
    if (!meta.stopCode) continue;
    const list = codeToIds.get(meta.stopCode) ?? [];
    list.push(stopId);
    codeToIds.set(meta.stopCode, list);
  }
  loadedAt = Date.now();
}

function memberCoords(feedId: string, stopId: string): { lat: number; lon: number } | null {
  const feed = loadDemoAssets().stopMeta[feedId] as
    | Record<string, { lat: number; lon: number }>
    | undefined;
  const meta = feed?.[stopId];
  if (meta?.lat != null && meta.lon != null) return { lat: meta.lat, lon: meta.lon };
  return null;
}

/**
 * TTC bustime GTFS-RT uses stop_ids from Surface GTFS. Demo fixtures may use an
 * older GTFS snapshot where the same numeric id points at a different location.
 * Resolve all live RT stop_ids that correspond to our map pin (by stop_code + coords).
 */
export async function resolveTtcRtStopIds(members: StopMember[]): Promise<string[]> {
  await ensureRegistry();
  const ids = new Set<string>();

  for (const m of members) {
    if (m.feedId !== "ttc") {
      ids.add(m.stopId);
      continue;
    }

    // Legacy fixture stop_id may point at a different location in current Surface GTFS.
    for (const sid of codeToIds.get(m.stopId) ?? []) ids.add(sid);

    const coords = memberCoords(m.feedId, m.stopId);
    if (!coords || !registry) continue;

    for (const [stopId, meta] of Object.entries(registry)) {
      if (haversineM(coords.lat, coords.lon, meta.lat, meta.lon) <= COORD_MATCH_M) {
        ids.add(stopId);
      }
    }
  }

  return [...ids];
}

/** True when a live RT stop_id is geographically the same stop as our group pin. */
export async function isTtcRtStopAtGroup(
  rtStopId: string,
  members: StopMember[],
): Promise<boolean> {
  await ensureRegistry();
  const live = registry?.[rtStopId];
  if (!live) return false;

  for (const m of members) {
    if (m.feedId !== "ttc") continue;
    if (live.stopCode === m.stopId) return true;

    const coords = memberCoords(m.feedId, m.stopId);
    if (coords && haversineM(coords.lat, coords.lon, live.lat, live.lon) <= COORD_MATCH_M) {
      return true;
    }
  }

  return false;
}
