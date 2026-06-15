import { preloadTripHeadsignIndex, tripHeadsigns } from "./demo-trip-headsign";
import { readDemoJsonFile } from "./demo-read";
import { loadTripStopsForTrip } from "./demo-schedule-data";
import { formatBoardTime, gtfsTimeToSec, torontoNowSec } from "./calendar";
import { goTripSuffix, goTripsMatch } from "./go-stop-aliases";

type BlockTrip = {
  trip_id: string;
  headsign: string | null;
  first_departure: string;
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

const cache = new Map<string, BlockIndex>();

async function loadBlockIndex(feedId: string): Promise<BlockIndex> {
  const hit = cache.get(feedId);
  if (hit) return hit;

  try {
    const data = await readDemoJsonFile<BlockIndex>(`${feedId}-block-index.json`);
    cache.set(feedId, data);
    return data;
  } catch {
    const empty = { blocks: {} };
    cache.set(feedId, empty);
    return empty;
  }
}

function tripIdsMatch(feedId: string, a: string, b: string): boolean {
  if (a === b) return true;
  if (feedId === "go") return goTripsMatch(a, b);
  return false;
}

function findBlockForTrip(
  idx: BlockIndex,
  feedId: string,
  tripId: string,
): BlockTrip[] | undefined {
  const blockId = idx.tripToBlock?.[tripId];
  if (blockId && idx.blocks[blockId]) return idx.blocks[blockId];

  for (const list of Object.values(idx.blocks)) {
    if (list.some((t) => tripIdsMatch(feedId, t.trip_id, tripId))) {
      return list;
    }
  }

  if (feedId === "go") {
    const suffix = goTripSuffix(tripId);
    for (const [tid, bid] of Object.entries(idx.tripToBlock ?? {})) {
      if (goTripSuffix(tid) === suffix && idx.blocks[bid]) return idx.blocks[bid];
    }
  }

  return undefined;
}

function formatTripTime(raw: string): string {
  const fmt = formatBoardTime(gtfsTimeToSec(raw), torontoNowSec());
  return fmt.time;
}

export async function loadFeedTripMeta(
  feedId: string,
  tripId: string,
): Promise<{ blockId: string | null }> {
  const idx = await loadBlockIndex(feedId);
  const mapped = idx.tripToBlock?.[tripId];
  if (mapped) return { blockId: mapped };

  for (const [blockId, list] of Object.entries(idx.blocks)) {
    if (list.some((t) => tripIdsMatch(feedId, t.trip_id, tripId))) {
      return { blockId };
    }
  }

  if (feedId === "go") {
    const suffix = goTripSuffix(tripId);
    for (const [tid, blockId] of Object.entries(idx.tripToBlock ?? {})) {
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
  const idx = await loadBlockIndex(feedId);
  const list = findBlockForTrip(idx, feedId, tripId);
  if (!list || list.length <= 1) return [];

  const activeIds = [...new Set([activeTripId, tripId, scheduleTripId].filter(Boolean))] as string[];
  const mapped = list.map((t) => ({
    ...t,
    active: activeIds.some((id) => tripIdsMatch(feedId, t.trip_id, id)),
  }));

  await preloadTripHeadsignIndex(feedId);
  const hits = await tripHeadsigns(
    feedId,
    mapped.map((t) => t.trip_id),
  );

  const withTimes = await Promise.all(
    mapped.map(async (t) => {
      const stops = await loadTripStopsForTrip(feedId, t.trip_id);
      const last = stops[stops.length - 1];
      return {
        trip_id: t.trip_id,
        headsign: t.headsign ?? hits.get(t.trip_id) ?? null,
        first_departure: t.first_departure,
        last_departure: last ? formatTripTime(last.departureTime) : undefined,
        active: t.active,
      };
    }),
  );

  return withTimes;
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
  const lookupIds = [...new Set([liveTripId, scheduleTripId].filter(Boolean))] as string[];
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

  return { blockId: null, blockTrips: [], blockStart: null, blockEnd: null };
}
