import { loadDemoAssets } from "./demo-assets";
import { readDemoJsonFile } from "./demo-read";
import { expandGoStopId } from "./go-stop-aliases";

export type TtcSurfaceStop = {
  stopCode: string | null;
  name: string;
  lat: number;
  lon: number;
};

type StopMember = { feedId: string; stopId: string };

/** Max distance to match one fixture pin to a live Surface stop_id. */
const COORD_MATCH_M = 20;
const REGISTRY_TTL_MS = 24 * 60 * 60_000;

let registry: Record<string, TtcSurfaceStop> | null = null;
let codeToIds = new Map<string, string[]>();
let loadedAt = 0;
const memberRtIdsCache = new Map<string, string[]>();

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
  memberRtIdsCache.clear();
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

/** Resolve live RT stop_ids for a single map pin (not all nearby stops). */
function resolveIdsForMember(m: StopMember): string[] {
  if (!registry) return [];
  const cacheKey = `${m.feedId}:${m.stopId}`;
  const cached = memberRtIdsCache.get(cacheKey);
  if (cached) return cached;

  const ids = new Set<string>();

  for (const sid of codeToIds.get(m.stopId) ?? []) ids.add(sid);

  const coords = memberCoords(m.feedId, m.stopId);
  if (coords) {
    let closest: string | undefined;
    let closestDist = Infinity;
    for (const [stopId, meta] of Object.entries(registry)) {
      const dist = haversineM(coords.lat, coords.lon, meta.lat, meta.lon);
      if (dist < closestDist) {
        closestDist = dist;
        closest = stopId;
      }
    }
    if (closest && closestDist <= COORD_MATCH_M) ids.add(closest);
  }

  const resolved = [...ids];
  memberRtIdsCache.set(cacheKey, resolved);
  return resolved;
}

/** Map demo fixture stop ids to RT rows via live stop_id aliases (TTC Surface ids). */
export async function mapFixtureStopsToRt<T>(
  feedId: string,
  fixtureStopIds: string[],
  lookup: (liveStopId: string) => T | undefined,
): Promise<Map<string, T>> {
  const out = new Map<string, T>();

  if (feedId === "ttc") {
    await ensureRegistry();
    for (const stopId of fixtureStopIds) {
      for (const liveId of resolveIdsForMember({ feedId: "ttc", stopId })) {
        const hit = lookup(liveId);
        if (hit) {
          out.set(stopId, hit);
          break;
        }
      }
    }
    return out;
  }

  for (const stopId of fixtureStopIds) {
    const lookupIds = feedId === "go" ? expandGoStopId(stopId) : [stopId];
    const hit = lookupIds.map((id) => lookup(id)).find((x) => x != null);
    if (hit) out.set(stopId, hit);
  }
  return out;
}

export async function resolveTtcRtStopIds(members: StopMember[]): Promise<string[]> {
  await ensureRegistry();
  const ids = new Set<string>();

  for (const m of members) {
    if (m.feedId !== "ttc") {
      ids.add(m.stopId);
      continue;
    }
    for (const sid of resolveIdsForMember(m)) ids.add(sid);
  }

  return [...ids];
}

/** True when RT stop_id matches a specific group member pin (not a neighbour). */
export async function isTtcRtStopAtGroup(
  rtStopId: string,
  members: StopMember[],
): Promise<boolean> {
  await ensureRegistry();
  const live = registry?.[rtStopId];
  if (!live) return false;

  for (const m of members) {
    if (m.feedId !== "ttc") continue;
    const allowed = resolveIdsForMember(m);
    if (allowed.includes(rtStopId)) return true;
  }

  return false;
}

/** Demo fixtures key stops by stop_code; live RT uses Surface stop_id. */
export async function fixtureStopIdForLive(
  liveStopId: string,
): Promise<string | null> {
  await ensureRegistry();
  const live = registry?.[liveStopId];
  return live?.stopCode ?? null;
}

export async function liveStopDisplayName(liveStopId: string): Promise<string | null> {
  await ensureRegistry();
  return registry?.[liveStopId]?.name ?? null;
}
