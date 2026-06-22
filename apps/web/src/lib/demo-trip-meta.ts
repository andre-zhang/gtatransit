import { preloadTripHeadsignIndex, tripHeadsigns } from "./demo-trip-headsign";
import { readDemoJsonFile } from "./demo-read";
import { formatGtfsDepartureTime, gtfsTimeToSec, makeMonotonicGtfsSecs } from "./calendar";
import { boardDestination } from "./headsign";
import { goLineCode } from "./go-rail";
import { goTripSuffix, goTripsMatch } from "./go-stop-aliases";
import { isGoRailTripId } from "./go-rail";

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
const tripSuffixToBlockCache = new Map<string, Record<string, string>>();
const blockListCache = new Map<string, BlockTrip[]>();

function formatBlockTime(raw: string | undefined): string {
  if (!raw?.trim()) return "—";
  const t = raw.trim();
  if (t.length <= 5 && t.includes(":")) {
    return formatGtfsDepartureTime(`${t}:00`);
  }
  return formatGtfsDepartureTime(t.length === 5 ? `${t}:00` : t);
}

function blockTripStartSec(t: BlockTrip): number {
  const raw = t.first_departure?.trim() ?? "";
  return gtfsTimeToSec(raw.length <= 5 ? `${raw}:00` : raw);
}

function blockTripEndSec(t: BlockTrip): number {
  const raw = (t.last_departure ?? t.first_departure)?.trim() ?? "";
  return gtfsTimeToSec(raw.length <= 5 ? `${raw}:00` : raw);
}

/** Drop trips whose start precedes the prior trip's end (bad GTFS block_id groupings). */
function filterSequentialBlockTrips(list: BlockTrip[]): BlockTrip[] {
  if (list.length <= 1) return list;
  const sorted = [...list].sort((a, b) =>
    a.first_departure.localeCompare(b.first_departure),
  );
  const starts = makeMonotonicGtfsSecs(sorted.map(blockTripStartSec));
  const ends = makeMonotonicGtfsSecs(sorted.map(blockTripEndSec));
  const kept: BlockTrip[] = [sorted[0]!];
  let lastEnd = ends[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const start = starts[i]!;
    if (start < lastEnd - 180) continue;
    kept.push(sorted[i]!);
    lastEnd = Math.max(lastEnd, ends[i]!);
  }
  return kept.length > 1 ? kept : sorted;
}

function indexTripToBlock(
  feedId: string,
  map: Record<string, string>,
): Record<string, string> {
  const suffixMap: Record<string, string> = {};
  for (const [tripId, blockId] of Object.entries(map)) {
    if (feedId === "go" || feedId === "up") {
      suffixMap[goTripSuffix(tripId)] = blockId;
    }
  }
  tripSuffixToBlockCache.set(feedId, suffixMap);
  return map;
}

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
    tripToBlockCache.set(feedId, indexTripToBlock(feedId, map));
    return map;
  } catch {
    /* fall through */
  }

  try {
    const legacy = await readDemoJsonFile<BlockIndex>(`${feedId}-block-index.json`);
    legacyIndexCache.set(feedId, legacy);
    const map = legacy.tripToBlock ?? {};
    tripToBlockCache.set(feedId, indexTripToBlock(feedId, map));
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
  if (feedId === "go" || feedId === "up") {
    if (isGoRailTripId(a) || isGoRailTripId(b)) return goTripsMatch(a, b);
  }
  return false;
}

async function findBlockForTrip(
  feedId: string,
  tripId: string,
): Promise<BlockTrip[] | undefined> {
  const tripToBlock = await loadTripToBlock(feedId);
  const blockId = tripToBlock[tripId];
  if (blockId) return loadBlockList(feedId, blockId);

  if (feedId === "go" || feedId === "up") {
    const suffix = goTripSuffix(tripId);
    const suffixKey = tripToBlock[`suffix:${suffix}`];
    if (suffixKey) return loadBlockList(feedId, suffixKey);

    const suffixMap = tripSuffixToBlockCache.get(feedId);
    const fromSuffix = suffixMap?.[suffix];
    if (fromSuffix) return loadBlockList(feedId, fromSuffix);

    for (const [tid, bid] of Object.entries(tripToBlock)) {
      if (tid.startsWith("suffix:")) continue;
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
  if (!list?.length) return [];
  const sequential = filterSequentialBlockTrips(list);
  if (sequential.length <= 1) return [];
  const capped = sequential.length > 50 ? sequential.slice(0, 50) : sequential;

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
    headsign: t.headsign?.trim()
      ? boardDestination(feedId, goLineCode(t.headsign) ?? undefined, t.headsign)
      : hits.get(t.trip_id) ?? null,
    first_departure: formatBlockTime(t.first_departure),
    last_departure: t.last_departure ? formatBlockTime(t.last_departure) : undefined,
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
