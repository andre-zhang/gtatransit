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
const inflight = new Map<string, Promise<string | null>>();
const feedIndexLoaders = new Map<string, Promise<Record<string, string>>>();
const feedIndexCache = new Map<string, Record<string, string>>();

async function loadBlockIndex(feedId: string): Promise<BlockIndex> {
  try {
    return await readDemoJsonFile<BlockIndex>(`${feedId}-block-index.json`);
  } catch {
    return { blocks: {} };
  }
}

async function loadFeedHeadsignIndex(feedId: string): Promise<Record<string, string>> {
  const cached = feedIndexCache.get(feedId);
  if (cached) return cached;

  let loader = feedIndexLoaders.get(feedId);
  if (!loader) {
    loader = (async () => {
      try {
        const data = await readDemoJsonFile<Record<string, string>>(
          `${feedId}-trip-headsigns.json`,
        );
        feedIndexCache.set(feedId, data);
        return data;
      } catch {
        const idx = await loadBlockIndex(feedId);
        const fallback: Record<string, string> = {};
        for (const list of Object.values(idx.blocks)) {
          for (const trip of list) {
            if (trip.headsign?.trim()) fallback[trip.trip_id] = trip.headsign.trim();
          }
        }
        feedIndexCache.set(feedId, fallback);
        return fallback;
      }
    })();
    feedIndexLoaders.set(feedId, loader);
  }

  return loader;
}

function headsignFromIndex(
  index: Record<string, string>,
  tripId: string,
): string | null {
  const hit = index[tripId]?.trim();
  return hit || null;
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

async function resolveHeadsign(feedId: string, tripId: string): Promise<string | null> {
  const index = await loadFeedHeadsignIndex(feedId);
  const indexed = headsignFromIndex(index, tripId);
  if (indexed) return indexed;

  const resolved = await resolveDemoTrip(feedId, tripId);
  const hs = resolved.scheduleRow?.headsign?.trim();
  if (hs && !looksLikeBareTripId(hs)) return hs;

  return null;
}

/** O(1) headsign lookup after the per-feed index is warm. */
export async function tripHeadsign(
  feedId: string,
  tripId: string,
): Promise<string | null> {
  const key = `${feedId}:${tripId}`;
  if (headsignCache.has(key)) return headsignCache.get(key) ?? null;

  let pending = inflight.get(key);
  if (!pending) {
    pending = resolveHeadsign(feedId, tripId).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  const result = await pending;
  headsignCache.set(key, result);
  return result;
}

/** Batch-resolve unique trip ids (deduped, index-first). */
export async function tripHeadsigns(
  feedId: string,
  tripIds: string[],
): Promise<Map<string, string | null>> {
  const index = await loadFeedHeadsignIndex(feedId);
  const out = new Map<string, string | null>();
  const missing: string[] = [];

  for (const tripId of new Set(tripIds)) {
    const cacheKey = `${feedId}:${tripId}`;
    if (headsignCache.has(cacheKey)) {
      out.set(tripId, headsignCache.get(cacheKey) ?? null);
      continue;
    }
    const indexed = headsignFromIndex(index, tripId);
    if (indexed) {
      headsignCache.set(cacheKey, indexed);
      out.set(tripId, indexed);
      continue;
    }
    missing.push(tripId);
  }

  if (missing.length) {
    await Promise.all(
      missing.map(async (tripId) => {
        const hs = await tripHeadsign(feedId, tripId);
        out.set(tripId, hs);
      }),
    );
  }

  return out;
}

export async function enrichHeadsign<T extends { trip_id: string; headsign?: string | null }>(
  feedId: string,
  rows: T[],
): Promise<Array<T & { headsign: string | null }>> {
  const index = await loadFeedHeadsignIndex(feedId);
  const missing: string[] = [];

  for (const row of rows) {
    const existing = row.headsign?.trim();
    if (existing && !needsHeadsignLookup(existing)) continue;
    if (headsignFromIndex(index, row.trip_id)) continue;
    missing.push(row.trip_id);
  }

  if (missing.length) await tripHeadsigns(feedId, missing);

  return rows.map((row) => {
    const existing = row.headsign?.trim();
    if (existing && !needsHeadsignLookup(existing)) {
      return { ...row, headsign: existing };
    }
    const cacheKey = `${feedId}:${row.trip_id}`;
    const cached = headsignCache.get(cacheKey);
    const indexed = headsignFromIndex(index, row.trip_id);
    return {
      ...row,
      headsign: cached ?? indexed ?? existing ?? null,
    };
  });
}

/** Warm the headsign index for a feed (call once per request path). */
export function preloadTripHeadsignIndex(feedId: string): Promise<void> {
  return loadFeedHeadsignIndex(feedId).then(() => undefined);
}
