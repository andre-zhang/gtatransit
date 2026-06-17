type TripStopsPayload = {
  stops: Array<{
    stopId: string;
    name: string;
    scheduled: string;
    predicted?: string;
    delayMin?: number;
    groupId?: string;
    passed?: boolean;
  }>;
};

const cache = new Map<string, { at: number; data: TripStopsPayload }>();
const TTL_MS = 60_000;

export function getCachedTripStops(key: string): TripStopsPayload | null {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  return hit.data;
}

export function setCachedTripStops(key: string, data: TripStopsPayload) {
  cache.set(key, { at: Date.now(), data });
}

export function tripStopsCacheKey(
  feedId: string,
  tripId: string,
  fromStop?: string,
  scheduleTrip?: string,
): string {
  return `${feedId}:${tripId}:${fromStop ?? ""}:${scheduleTrip ?? ""}`;
}
