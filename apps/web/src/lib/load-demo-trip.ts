import { ensureDemoAssets } from "@/lib/demo-assets";
import { buildDemoTripStops } from "@/lib/demo-trip-stops";
import { pickScheduleTripId, resolveDemoTrip } from "@/lib/demo-trip-resolve";
import {
  headsignFromWarmIndex,
  preloadTripHeadsignIndex,
  tripHeadsign,
} from "@/lib/demo-trip-headsign";
import { getTripRt, ensureRtCache } from "@/lib/rt-cache";

export type DemoTripPayload = {
  tripId: string;
  feedId: string;
  fromStop?: string;
  headsign: string | null;
  scheduleTripId?: string;
  vehicleId?: string;
  route: {
    routeId: string;
    shortName: string;
    color: string;
  } | null;
  stops: Awaited<ReturnType<typeof buildDemoTripStops>>;
};

export async function loadDemoTripPayload(
  feedId: string,
  tripId: string,
  opts?: { fromStop?: string; scheduleTrip?: string },
): Promise<DemoTripPayload> {
  await ensureDemoAssets();
  await ensureRtCache();

  const [, resolved] = await Promise.all([
    preloadTripHeadsignIndex(feedId),
    resolveDemoTrip(feedId, tripId),
  ]);

  const scheduleTripId = await pickScheduleTripId(
    feedId,
    tripId,
    opts?.scheduleTrip,
    resolved,
  );
  const liveTripId = resolved.liveTripId;
  const tripRt = getTripRt(feedId, liveTripId);
  const warmHeadsign = headsignFromWarmIndex(feedId, liveTripId);
  const scheduleRow = resolved.scheduleRow;
  const routeId = scheduleRow?.routeId ?? tripRt?.routeId;

  const [headsign, stops] = await Promise.all([
    warmHeadsign != null
      ? Promise.resolve(warmHeadsign)
      : tripHeadsign(feedId, liveTripId),
    buildDemoTripStops({
      feedId,
      liveTripId,
      scheduleTripId,
      fromStop: opts?.fromStop,
    }),
  ]);

  return {
    tripId,
    feedId,
    fromStop: opts?.fromStop,
    headsign,
    scheduleTripId,
    vehicleId: tripRt?.vehicleId,
    route: routeId
      ? {
          routeId,
          shortName: scheduleRow?.routeShort ?? routeId,
          color: scheduleRow?.routeColor ?? "#da291c",
        }
      : null,
    stops,
  };
}
