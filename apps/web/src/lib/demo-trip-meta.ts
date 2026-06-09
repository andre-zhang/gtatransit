import { readDemoJsonFile } from "./demo-read";

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
    if (list.some((t) => t.trip_id === tripId)) return list;
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
  const list = findBlockForTrip(idx, tripId);
  if (!list || list.length <= 1) return [];

  return list.map((t) => ({
    ...t,
    active: t.trip_id === activeTripId || t.trip_id === tripId,
  }));
}
