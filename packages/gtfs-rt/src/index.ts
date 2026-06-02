import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export type RtVehicle = {
  feedId: string;
  vehicleId: string;
  tripId?: string;
  routeId?: string;
  label?: string;
  lat?: number;
  lon?: number;
  bearing?: number;
  speed?: number;
  currentStopSequence?: number;
  delaySec?: number;
  occupancyStatus?: number;
};

export type RtTripUpdate = {
  feedId: string;
  tripId: string;
  stopId: string;
  stopSequence?: number;
  delaySec?: number;
  arrivalTime?: number;
  departureTime?: number;
  platform?: string;
};

function extractPlatform(stu: Record<string, unknown>): string | undefined {
  const direct =
    (stu.platform as string | undefined) ??
    (stu.track as string | undefined) ??
    (stu.platformCode as string | undefined);
  if (direct) return String(direct);
  const nyct = stu.NyctStopTimeUpdate as Record<string, unknown> | undefined;
  if (nyct?.scheduledTrack) return String(nyct.scheduledTrack);
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
    for (const stu of tu.stopTimeUpdate ?? []) {
      if (!stu.stopId) continue;
      out.push({
        feedId,
        tripId: tu.trip.tripId,
        stopId: stu.stopId,
        stopSequence: stu.stopSequence ?? undefined,
        delaySec: stu.arrival?.delay ?? stu.departure?.delay ?? undefined,
        arrivalTime: stu.arrival?.time != null ? Number(stu.arrival.time) : undefined,
        departureTime: stu.departure?.time != null ? Number(stu.departure.time) : undefined,
        platform: extractPlatform(stu as unknown as Record<string, unknown>),
      });
    }
  }
  return out;
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
    vehicles: "https://www.miapp.ca/gtfsrt/vehiclepositions",
    tripUpdates: "https://www.miapp.ca/gtfsrt/tripupdates",
  },
};

export async function fetchRt(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`RT fetch failed ${url}: ${res.status}`);
  return decodeFeed(await res.arrayBuffer());
}
