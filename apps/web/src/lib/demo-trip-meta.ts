import { readDemoJsonFile } from "./demo-read";

type BlockTrip = {
  trip_id: string;
  headsign: string | null;
  first_departure: string;
};

type BlockIndex = {
  blocks: Record<string, BlockTrip[]>;
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
  blocks: Record<string, BlockTrip[]>,
  tripId: string,
): BlockTrip[] | undefined {
  for (const list of Object.values(blocks)) {
    if (list.some((t) => t.trip_id === tripId)) return list;
  }
  return undefined;
}

export async function loadFeedTripMeta(
  feedId: string,
  tripId: string,
): Promise<{ blockId: string | null }> {
  const idx = await loadBlockIndex(feedId);
  for (const [blockId, list] of Object.entries(idx.blocks)) {
    if (list.some((t) => t.trip_id === tripId)) return { blockId };
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
  const list = findBlockForTrip(idx.blocks, tripId);
  if (!list || list.length <= 1) return [];

  return list.map((t) => ({
    ...t,
    active: t.trip_id === activeTripId || t.trip_id === tripId,
  }));
}
