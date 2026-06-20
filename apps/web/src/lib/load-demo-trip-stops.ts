import { ensureDemoStopAssets } from "./demo-assets";
import { buildDemoTripStops } from "./demo-trip-stops";
import { ensureRtCacheWithin } from "./rt-cache";

/** Fast path for departure-board row expand — schedule stops + optional RT overlay. */
export async function loadDemoTripStopsLite(
  feedId: string,
  tripId: string,
  opts?: { fromStop?: string; scheduleTrip?: string },
) {
  await ensureDemoStopAssets();
  await ensureRtCacheWithin(3000);

  const scheduleTripId = opts?.scheduleTrip?.trim() || tripId;
  const stops = await buildDemoTripStops({
    feedId,
    liveTripId: tripId,
    scheduleTripId,
    fromStop: opts?.fromStop,
    sliceFromStop: true,
  });

  return { stops };
}
