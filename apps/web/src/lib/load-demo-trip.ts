import { ensureDemoAssets } from "@/lib/demo-assets";
import { buildDemoTripStops } from "@/lib/demo-trip-stops";
import { pickScheduleTripId, resolveDemoTrip } from "@/lib/demo-trip-resolve";
import { preloadTripHeadsignIndex, tripHeadsign } from "@/lib/demo-trip-headsign";
import { getTripRt } from "@/lib/rt-cache";

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
  await preloadTripHeadsignIndex(feedId);

  const resolved = await resolveDemoTrip(feedId, tripId);
  const scheduleTripId = await pickScheduleTripId(
    feedId,
    tripId,
    opts?.scheduleTrip,
    resolved,
  );
  const liveTripId = resolved.liveTripId;
  const tripRt = getTripRt(feedId, liveTripId);
  const headsign = await tripHeadsign(feedId, liveTripId);

  const scheduleRow = resolved.scheduleRow;
  const routeId = scheduleRow?.routeId ?? tripRt?.routeId;

  const stops = await buildDemoTripStops({
    feedId,
    liveTripId,
    scheduleTripId,
    fromStop: opts?.fromStop,
  });

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
