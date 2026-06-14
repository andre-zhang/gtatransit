import { preloadTripHeadsignIndex, tripHeadsigns } from "./demo-trip-headsign";
import { readDemoJsonFile } from "./demo-read";
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

function findBlockForTrip(
  idx: BlockIndex,
  tripId: string,
): BlockTrip[] | undefined {
  const blockId = idx.tripToBlock?.[tripId];
  if (blockId && idx.blocks[blockId]) return idx.blocks[blockId];

  for (const list of Object.values(idx.blocks)) {
    if (list.some((t) => t.trip_id === tripId || goTripsMatch(t.trip_id, tripId))) {
      return list;
    }
  }

  const suffix = goTripSuffix(tripId);
  for (const [tid, bid] of Object.entries(idx.tripToBlock ?? {})) {
    if (goTripSuffix(tid) === suffix && idx.blocks[bid]) return idx.blocks[bid];
  }

  return undefined;
}

export async function loadFeedTripMeta(
  feedId: string,
  tripId: string,
): Promise<{ blockId: string | null }> {
  const idx = await loadBlockIndex(feedId);
  const mapped = idx.tripToBlock?.[tripId];
  if (mapped) return { blockId: mapped };
  for (const [blockId, list] of Object.entries(idx.blocks)) {
    if (list.some((t) => t.trip_id === tripId || goTripsMatch(t.trip_id, tripId))) {
      return { blockId };
    }
  }
  const suffix = goTripSuffix(tripId);
  for (const [tid, blockId] of Object.entries(idx.tripToBlock ?? {})) {
    if (goTripSuffix(tid) === suffix) return { blockId };
  }
  return { blockId: null };
}

export async function loadBlockTrips(
  feedId: string,
  tripId: string,
  activeTripId: string,
): Promise<
  Array<{
    trip_id: string;
    headsign: string | null;
    first_departure: string;
    active: boolean;
  }>
> {
  const idx = await loadBlockIndex(feedId);
  const list = findBlockForTrip(idx, tripId);
  if (!list || list.length <= 1) return [];

  const mapped = list.map((t) => ({
    ...t,
    active:
      t.trip_id === activeTripId ||
      t.trip_id === tripId ||
      goTripsMatch(t.trip_id, activeTripId) ||
      goTripsMatch(t.trip_id, tripId),
  }));

  await preloadTripHeadsignIndex(feedId);
  const hits = await tripHeadsigns(
    feedId,
    mapped.map((t) => t.trip_id),
  );

  return mapped.map((t) => ({
    ...t,
    headsign: t.headsign ?? hits.get(t.trip_id) ?? null,
  }));
}
