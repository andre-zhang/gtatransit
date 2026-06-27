export function routePageHref(feedId: string, routeId: string): string {
  return `/route/${feedId}/${encodeURIComponent(routeId)}`;
}

export function tripPageHref(
  feedId: string,
  tripId: string,
  opts?: { fromStop?: string; scheduleTrip?: string },
): string {
  const params = new URLSearchParams();
  if (opts?.fromStop) params.set("fromStop", opts.fromStop);
  if (opts?.scheduleTrip && opts.scheduleTrip !== tripId) {
    params.set("scheduleTrip", opts.scheduleTrip);
  }
  const qs = params.toString() ? `?${params}` : "";
  return `/trip/${feedId}/${encodeURIComponent(tripId)}${qs}`;
}

export function runPageHref(feedId: string, vehicleId: string): string {
  return `/run/${feedId}/${encodeURIComponent(vehicleId)}`;
}

/** Static GTFS block assignment (no live GPS required). */
export const BLOCK_VEHICLE_PREFIX = "b:";

export function blockVehicleId(blockId: string): string {
  return `${BLOCK_VEHICLE_PREFIX}${blockId}`;
}

export function parseBlockVehicleId(vehicleId: string): string | null {
  return vehicleId.startsWith(BLOCK_VEHICLE_PREFIX)
    ? vehicleId.slice(BLOCK_VEHICLE_PREFIX.length)
    : null;
}
