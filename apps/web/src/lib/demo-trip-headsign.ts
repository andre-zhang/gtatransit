import { lookupTripFromSchedules } from "./demo-trip-lookup";
import { resolveDemoTrip } from "./demo-trip-resolve";
import { readDemoJsonFile } from "./demo-read";

type BlockTrip = {
  trip_id: string;
  headsign?: string | null;
  first_departure: string;
};

type BlockIndex = {
  blocks: Record<string, BlockTrip[]>;
  tripToBlock?: Record<string, string>;
};

const headsignCache = new Map<string, string | null>();
const blockIndexCache = new Map<string, BlockIndex>();

async function loadBlockIndex(feedId: string): Promise<BlockIndex> {
  const hit = blockIndexCache.get(feedId);
  if (hit) return hit;
  try {
    const data = await readDemoJsonFile<BlockIndex>(`${feedId}-block-index.json`);
    blockIndexCache.set(feedId, data);
    return data;
  } catch {
    const empty = { blocks: {} };
    blockIndexCache.set(feedId, empty);
    return empty;
  }
}

function headsignFromBlockIndex(idx: BlockIndex, tripId: string): string | null {
  const blockId = idx.tripToBlock?.[tripId];
  if (blockId && idx.blocks[blockId]) {
    const hit = idx.blocks[blockId]!.find((t) => t.trip_id === tripId);
    if (hit?.headsign?.trim()) return hit.headsign.trim();
  }
  for (const list of Object.values(idx.blocks)) {
    const hit = list.find((t) => t.trip_id === tripId);
    if (hit?.headsign?.trim()) return hit.headsign.trim();
  }
  return null;
}

export function looksLikeBareTripId(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (/^\d{6,}$/.test(v)) return true;
  if (/^\d{8}-/.test(v)) return false;
  return false;
}

export function needsHeadsignLookup(destination: string | null | undefined): boolean {
  const d = destination?.trim();
  if (!d || d === "In service" || d === "—") return true;
  return looksLikeBareTripId(d);
}

/** Resolve a display headsign for any trip id (schedule, live RT, or block). */
export async function tripHeadsign(
  feedId: string,
  tripId: string,
): Promise<string | null> {
  const key = `${feedId}:${tripId}`;
  if (headsignCache.has(key)) return headsignCache.get(key) ?? null;

  let result: string | null = null;

  const exact = await lookupTripFromSchedules(feedId, tripId);
  if (exact?.headsign?.trim() && !looksLikeBareTripId(exact.headsign)) {
    result = exact.headsign.trim();
  }

  if (!result) {
    const idx = await loadBlockIndex(feedId);
    result = headsignFromBlockIndex(idx, tripId);
  }

  if (!result) {
    const resolved = await resolveDemoTrip(feedId, tripId);
    const hs = resolved.scheduleRow?.headsign?.trim();
    if (hs && !looksLikeBareTripId(hs)) result = hs;
  }

  headsignCache.set(key, result);
  return result;
}

export async function enrichHeadsign<T extends { trip_id: string; headsign?: string | null }>(
  feedId: string,
  rows: T[],
): Promise<Array<T & { headsign: string | null }>> {
  return Promise.all(
    rows.map(async (row) => {
      const existing = row.headsign?.trim();
      if (existing && !needsHeadsignLookup(existing)) {
        return { ...row, headsign: existing };
      }
      const resolved = await tripHeadsign(feedId, row.trip_id);
      return { ...row, headsign: resolved ?? existing ?? null };
    }),
  );
}
