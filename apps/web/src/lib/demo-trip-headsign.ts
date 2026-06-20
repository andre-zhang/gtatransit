import { goTripsMatch } from "./go-stop-aliases";
import { cleanHeadsign } from "./headsign";
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

/** Compact tuple: [headsign, directionId?] */
type TripMetaTuple = [string, number?];

type FeedMeta = {
  headsigns: Record<string, string>;
  directions: Record<string, number>;
};

const META_TTL_MS = 60 * 60_000;
const headsignCache = new Map<string, string | null>();
const directionCache = new Map<string, number | null>();
const inflight = new Map<string, Promise<string | null>>();
const feedMetaLoaders = new Map<string, Promise<FeedMeta>>();
const feedMetaCache = new Map<string, { at: number; meta: FeedMeta }>();

async function loadBlockIndex(feedId: string): Promise<BlockIndex> {
  try {
    return await readDemoJsonFile<BlockIndex>(`${feedId}-block-index.json`);
  } catch {
    return { blocks: {} };
  }
}

function parseTripMetaFile(raw: Record<string, TripMetaTuple | string>): FeedMeta {
  const headsigns: Record<string, string> = {};
  const directions: Record<string, number> = {};
  for (const [tripId, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      const hs = cleanHeadsign(value);
      if (hs) headsigns[tripId] = hs;
      continue;
    }
    const hs = cleanHeadsign(value[0]);
    if (hs) headsigns[tripId] = hs;
    if (value[1] != null) directions[tripId] = value[1];
  }
  return { headsigns, directions };
}

async function loadFeedMeta(feedId: string): Promise<FeedMeta> {
  const cached = feedMetaCache.get(feedId);
  if (cached && Date.now() - cached.at < META_TTL_MS) return cached.meta;

  let loader = feedMetaLoaders.get(feedId);
  if (!loader) {
    loader = (async () => {
      try {
        const raw = await readDemoJsonFile<Record<string, TripMetaTuple | string>>(
          `${feedId}-trip-meta.json`,
        );
        const meta = parseTripMetaFile(raw);
        feedMetaCache.set(feedId, { at: Date.now(), meta });
        return meta;
      } catch {
        try {
          const legacy = await readDemoJsonFile<Record<string, string>>(
            `${feedId}-trip-headsigns.json`,
          );
          const meta = parseTripMetaFile(legacy);
          feedMetaCache.set(feedId, { at: Date.now(), meta });
          return meta;
        } catch {
          const idx = await loadBlockIndex(feedId);
          const headsigns: Record<string, string> = {};
          for (const list of Object.values(idx.blocks)) {
            for (const trip of list) {
              const hs = cleanHeadsign(trip.headsign);
              if (hs) headsigns[trip.trip_id] = hs;
            }
          }
          const meta = { headsigns, directions: {} };
          feedMetaCache.set(feedId, { at: Date.now(), meta });
          return meta;
        }
      }
    })();
    feedMetaLoaders.set(feedId, loader);
  }

  return loader;
}

function headsignFromMeta(meta: FeedMeta, tripId: string): string | null {
  const direct = meta.headsigns[tripId]?.trim();
  if (direct) return direct;
  for (const [id, hs] of Object.entries(meta.headsigns)) {
    if (goTripsMatch(id, tripId) && hs.trim()) return hs.trim();
  }
  return null;
}

function directionFromMeta(meta: FeedMeta, tripId: string): number | null {
  const d = meta.directions[tripId];
  return d != null ? d : null;
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
  const meta = await loadFeedMeta(feedId);
  const indexed = headsignFromMeta(meta, tripId);
  if (indexed) return indexed;

  const resolved = await resolveDemoTrip(feedId, tripId);
  const hs = cleanHeadsign(resolved.scheduleRow?.headsign);
  if (hs && !looksLikeBareTripId(hs)) return hs;

  return null;
}

export async function tripDirection(
  feedId: string,
  tripId: string,
): Promise<number | null> {
  const key = `${feedId}:${tripId}`;
  if (directionCache.has(key)) return directionCache.get(key) ?? null;
  const meta = await loadFeedMeta(feedId);
  const dir = directionFromMeta(meta, tripId);
  directionCache.set(key, dir);
  return dir;
}

/** O(1) headsign lookup after the per-feed meta index is warm. */
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
  const meta = await loadFeedMeta(feedId);
  const out = new Map<string, string | null>();
  const missing: string[] = [];

  for (const tripId of new Set(tripIds)) {
    const cacheKey = `${feedId}:${tripId}`;
    if (headsignCache.has(cacheKey)) {
      out.set(tripId, headsignCache.get(cacheKey) ?? null);
      continue;
    }
    const indexed = headsignFromMeta(meta, tripId);
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

/** Warm the trip meta index for a feed (call once per request path). */
export function preloadTripHeadsignIndex(feedId: string): Promise<void> {
  return loadFeedMeta(feedId).then(() => undefined);
}

/** Sync lookups — only valid after `preloadTripHeadsignIndex` for this feed. */
export function headsignFromWarmIndex(feedId: string, tripId: string): string | null {
  const cached = feedMetaCache.get(feedId);
  if (!cached) return null;
  return headsignFromMeta(cached.meta, tripId);
}

export function directionFromWarmIndex(feedId: string, tripId: string): number | null {
  const cached = feedMetaCache.get(feedId);
  if (!cached) return null;
  return directionFromMeta(cached.meta, tripId);
}
