import { preloadTripHeadsignIndex, tripHeadsigns } from "./demo-trip-headsign";
import { readDemoJsonFile } from "./demo-read";
import { goTripSuffix, goTripsMatch } from "./go-stop-aliases";

type BlockTrip = {
  trip_id: string;
  headsign: string | null;
  first_departure: string;
  last_departure?: string;
};

type BlockIndex = {
  blocks: Record<string, BlockTrip[]>;
  tripToBlock?: Record<string, string>;
};

export type BlockTripRow = {
  trip_id: string;
  headsign: string | null;
  first_departure: string;
  last_departure?: string;
  active: boolean;
};

const legacyIndexCache = new Map<string, BlockIndex>();
const tripToBlockCache = new Map<string, Record<string, string>>();
const blockListCache = new Map<string, BlockTrip[]>();

function blockFileName(blockId: string): string {
  return `${Buffer.from(blockId, "utf8").toString("base64url")}.json`;
}

async function loadTripToBlock(feedId: string): Promise<Record<string, string>> {
  const hit = tripToBlockCache.get(feedId);
  if (hit) return hit;

  try {
    const map = await readDemoJsonFile<Record<string, string>>(
      `${feedId}-trip-to-block.json`,
    );
    tripToBlockCache.set(feedId, map);
    return map;
  } catch {
    /* fall through */
  }

  try {
    const legacy = await readDemoJsonFile<BlockIndex>(`${feedId}-block-index.json`);
    legacyIndexCache.set(feedId, legacy);
    const map = legacy.tripToBlock ?? {};
    tripToBlockCache.set(feedId, map);
    return map;
  } catch {
    const empty = {};
    tripToBlockCache.set(feedId, empty);
    return empty;
  }
}

async function loadBlockList(
  feedId: string,
  blockId: string,
): Promise<BlockTrip[] | undefined> {
  const cacheKey = `${feedId}:${blockId}`;
  const hit = blockListCache.get(cacheKey);
  if (hit) return hit;

  try {
    const list = await readDemoJsonFile<BlockTrip[]>(
      `${feedId}-blocks/${blockFileName(blockId)}`,
    );
    blockListCache.set(cacheKey, list);
    return list;
  } catch {
    /* fall through */
  }

  let legacy = legacyIndexCache.get(feedId);
  if (!legacy) {
    try {
      legacy = await readDemoJsonFile<BlockIndex>(`${feedId}-block-index.json`);
      legacyIndexCache.set(feedId, legacy);
    } catch {
      return undefined;
    }
  }
  const list = legacy.blocks[blockId];
  if (list) blockListCache.set(cacheKey, list);
  return list;
}

function tripIdsMatch(feedId: string, a: string, b: string): boolean {
  if (a === b) return true;
  if (feedId === "go") return goTripsMatch(a, b);
  return false;
}

async function findBlockForTrip(
  feedId: string,
  tripId: string,
): Promise<BlockTrip[] | undefined> {
  const tripToBlock = await loadTripToBlock(feedId);
  const blockId = tripToBlock[tripId];
  if (blockId) return loadBlockList(feedId, blockId);

  if (feedId === "go") {
    const suffix = goTripSuffix(tripId);
    for (const [tid, bid] of Object.entries(tripToBlock)) {
      if (goTripSuffix(tid) === suffix) return loadBlockList(feedId, bid);
    }
  }

  const legacy = legacyIndexCache.get(feedId);
  if (legacy?.blocks) {
    for (const list of Object.values(legacy.blocks)) {
      if (list.some((t) => tripIdsMatch(feedId, t.trip_id, tripId))) return list;
    }
  }

  return undefined;
}

export async function loadFeedTripMeta(
  feedId: string,
  tripId: string,
): Promise<{ blockId: string | null }> {
  const tripToBlock = await loadTripToBlock(feedId);
  const mapped = tripToBlock[tripId];
  if (mapped) return { blockId: mapped };

  if (feedId === "go") {
    const suffix = goTripSuffix(tripId);
    for (const [tid, blockId] of Object.entries(tripToBlock)) {
      if (goTripSuffix(tid) === suffix) return { blockId };
    }
  }

  return { blockId: null };
}

export async function loadBlockTrips(
  feedId: string,
  tripId: string,
  activeTripId: string,
  scheduleTripId?: string,
): Promise<BlockTripRow[]> {
  const list = await findBlockForTrip(feedId, tripId);
  if (!list || list.length <= 1) return [];
  const capped = list.length > 50 ? list.slice(0, 50) : list;

  const primaryActive = scheduleTripId ?? activeTripId;
  const mapped = capped.map((t) => ({
    ...t,
    active: tripIdsMatch(feedId, t.trip_id, primaryActive),
  }));

  const missingIds = mapped.filter((t) => !t.headsign?.trim()).map((t) => t.trip_id);
  let hits = new Map<string, string | null>();
  if (missingIds.length) {
    await preloadTripHeadsignIndex(feedId);
    hits = await tripHeadsigns(feedId, missingIds);
  }

  return mapped.map((t) => ({
    trip_id: t.trip_id,
    headsign: t.headsign?.trim() ? t.headsign : hits.get(t.trip_id) ?? null,
    first_departure: t.first_departure,
    last_departure: t.last_departure,
    active: t.active,
  }));
}

/** Resolve block trips using live RT trip id first, then schedule id. */
export async function resolveVehicleBlock(
  feedId: string,
  liveTripId: string | undefined,
  scheduleTripId: string | undefined,
): Promise<{
  blockId: string | null;
  blockTrips: BlockTripRow[];
  blockStart: string | null;
  blockEnd: string | null;
}> {
  const lookupIds = [...new Set([scheduleTripId, liveTripId].filter(Boolean))] as string[];
  if (!lookupIds.length) {
    return { blockId: null, blockTrips: [], blockStart: null, blockEnd: null };
  }

  const activeTripId = liveTripId ?? scheduleTripId ?? lookupIds[0]!;

  for (const tripId of lookupIds) {
    const blockTrips = await loadBlockTrips(
      feedId,
      tripId,
      activeTripId,
      scheduleTripId,
    );
    if (blockTrips.length) {
      const meta = await loadFeedTripMeta(feedId, tripId);
      const blockStart = blockTrips[0]!.first_departure;
      const last = blockTrips[blockTrips.length - 1]!;
      const blockEnd = last.last_departure ?? last.first_departure;
      return { blockId: meta.blockId, blockTrips, blockStart, blockEnd };
    }
  }

  if (liveTripId && !scheduleTripId) {
    const { resolveDemoTrip } = await import("./demo-trip-resolve");
    const resolved = await resolveDemoTrip(feedId, liveTripId);
    if (resolved.scheduleTripId && resolved.scheduleTripId !== liveTripId) {
      const blockTrips = await loadBlockTrips(
        feedId,
        resolved.scheduleTripId,
        activeTripId,
        resolved.scheduleTripId,
      );
      if (blockTrips.length) {
        const meta = await loadFeedTripMeta(feedId, resolved.scheduleTripId);
        const blockStart = blockTrips[0]!.first_departure;
        const last = blockTrips[blockTrips.length - 1]!;
        const blockEnd = last.last_departure ?? last.first_departure;
        return { blockId: meta.blockId, blockTrips, blockStart, blockEnd };
      }
    }
  }

  return { blockId: null, blockTrips: [], blockStart: null, blockEnd: null };
}
