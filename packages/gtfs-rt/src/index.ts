import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export type { RtTripUpdate, RtVehicle } from "./rt-types";
import type { RtTripUpdate, RtVehicle } from "./rt-types";

function extractPlatform(stu: Record<string, unknown>): string | undefined {
  const direct =
    (stu.platform as string | undefined) ??
    (stu.track as string | undefined) ??
    (stu.platformCode as string | undefined);
  if (direct) return String(direct);

  const props = (stu.stopTimeProperties ?? stu.stop_time_properties) as
    | Record<string, unknown>
    | undefined;
  const assigned = props?.assignedStopId ?? props?.assigned_stop_id;
  if (assigned) return String(assigned);

  const nyct = stu.NyctStopTimeUpdate as Record<string, unknown> | undefined;
  if (nyct?.scheduledTrack) return String(nyct.scheduledTrack);
  if (nyct?.actualTrack) return String(nyct.actualTrack);

  return undefined;
}

export function decodeFeed(buffer: ArrayBuffer): GtfsRealtimeBindings.transit_realtime.FeedMessage {
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
}

export function parseVehicles(
  feedId: string,
  message: GtfsRealtimeBindings.transit_realtime.FeedMessage,
): RtVehicle[] {
  const out: RtVehicle[] = [];
  for (const entity of message.entity) {
    const vp = entity.vehicle;
    if (!vp) continue;
    const id = vp.vehicle?.id ?? entity.id;
    if (!id) continue;
    const trip = vp.trip as { delay?: number | null } | null | undefined;
    out.push({
      feedId,
      vehicleId: id,
      tripId: vp.trip?.tripId ?? undefined,
      routeId: vp.trip?.routeId ?? undefined,
      label: vp.vehicle?.label ?? undefined,
      lat: vp.position?.latitude ?? undefined,
      lon: vp.position?.longitude ?? undefined,
      bearing: vp.position?.bearing ?? undefined,
      speed: vp.position?.speed ?? undefined,
      currentStopSequence: vp.currentStopSequence ?? undefined,
      occupancyStatus: vp.occupancyStatus ?? undefined,
      delaySec: trip?.delay != null ? Number(trip.delay) : undefined,
    });
  }
  return out;
}

export function parseTripUpdates(
  feedId: string,
  message: GtfsRealtimeBindings.transit_realtime.FeedMessage,
): RtTripUpdate[] {
  const out: RtTripUpdate[] = [];
  for (const entity of message.entity) {
    const tu = entity.tripUpdate;
    if (!tu?.trip?.tripId) continue;
    const vehicleId = tu.vehicle?.id ?? undefined;
    const vehicleLabel = tu.vehicle?.label ?? undefined;
    for (const stu of tu.stopTimeUpdate ?? []) {
      if (!stu.stopId) continue;
      out.push({
        feedId,
        tripId: tu.trip.tripId,
        routeId: tu.trip.routeId ?? undefined,
        stopId: stu.stopId,
        stopSequence: stu.stopSequence ?? undefined,
        delaySec: stu.arrival?.delay ?? stu.departure?.delay ?? undefined,
        arrivalTime: stu.arrival?.time != null ? Number(stu.arrival.time) : undefined,
        departureTime: stu.departure?.time != null ? Number(stu.departure.time) : undefined,
        platform: extractPlatform(stu as unknown as Record<string, unknown>),
        vehicleId,
        vehicleLabel,
      });
    }
  }
  return out;
}

/** Metrolinx Open Data API — legacy GTFS/* paths return 500; use V1 feed routes. */
export const GO_RT_API = {
  base: "https://api.openmetrolinx.com/OpenDataAPI",
  tripUpdates: "api/V1/Gtfs/Feed/TripUpdates",
  vehiclePositions: "api/V1/Gtfs/Feed/VehiclePosition",
} as const;

export const UP_RT_API = {
  base: "https://api.openmetrolinx.com/OpenDataAPI",
  tripUpdates: "api/V1/UP/Gtfs/Feed/TripUpdates",
  vehiclePositions: "api/V1/UP/Gtfs/Feed/VehiclePosition",
} as const;

/** Metrolinx keys are passed as `?key=` on the URL (not subscription headers). */
export function metrolinxApiUrl(path: string, apiKey: string): string {
  const cleanPath = path.replace(/^\//, "");
  const url = new URL(`${GO_RT_API.base}/${cleanPath}`);
  url.searchParams.set("key", apiKey.trim());
  return url.toString();
}

export const RT_FEEDS: Record<
  string,
  { vehicles?: string; tripUpdates?: string; headers?: Record<string, string> }
> = {
  ttc: {
    vehicles: "https://bustime.ttc.ca/gtfsrt/vehicles",
    tripUpdates: "https://bustime.ttc.ca/gtfsrt/trips",
  },
  miway: {
    vehicles: "https://www.miapp.ca/GTFS_RT/Vehicle/VehiclePositions.pb",
    tripUpdates: "https://www.miapp.ca/GTFS_RT/TripUpdate/TripUpdates.pb",
  },
  yrt: {
    vehicles: "https://rtu.york.ca/gtfsrealtime/VehiclePositions",
    tripUpdates: "https://rtu.york.ca/gtfsrealtime/TripUpdates",
  },
  drt: {
    vehicles: "https://drtonline.durhamregiontransit.com/gtfsrealtime/VehiclePositions",
    tripUpdates: "https://drtonline.durhamregiontransit.com/gtfsrealtime/TripUpdates",
  },
};

export async function fetchRt(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`RT fetch failed ${url}: ${res.status}`);
  return decodeFeed(await res.arrayBuffer());
}

export {
  metrolinxJsonError,
  metrolinxJsonOk,
  parseMetrolinxJsonTripUpdates,
  parseMetrolinxJsonVehicles,
} from "./metrolinx-json";
