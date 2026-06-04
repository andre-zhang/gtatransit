import { ensureDemoAssets, getDemoCore } from "./demo";
import { getGroupedDemoStops, resolveStopGroupId } from "./demo-stop-groups";
import { getTripStops } from "./demo-schedules";
import { lookupRouteFromSchedules, lookupTripFromSchedules } from "./demo-trip-lookup";
import { getDemoRoutesGeoJson } from "./demo-routes";
import { routeColor } from "./colors";
import { gtfsTimeToSec, secToTime } from "./calendar";
import { getRtVehicles, getTripRt, getStopTripRt } from "./rt-cache";

async function findRouteMeta(feedId: string, routeId: string | undefined) {
  if (!routeId) return null;
  for (const agency of getDemoCore().filterTree.agencies) {
    if (agency.id !== feedId) continue;
    for (const mode of agency.modes) {
      const r = mode.routes.find((x) => x.id === routeId || x.shortName === routeId);
      if (r) {
        return {
          short_name: r.shortName,
          long_name: r.longName,
          color: routeColor(feedId, r.shortName, null),
        };
      }
    }
  }
  const sample = await lookupRouteFromSchedules(feedId, routeId);
  if (sample) {
    return {
      short_name: sample.routeShort,
      long_name: sample.headsign,
      color: sample.routeColor,
    };
  }
  return null;
}

function findShape(feedId: string, routeId: string | undefined, direction = 0) {
  if (!routeId) return null;
  const fc = getDemoRoutesGeoJson();
  const feature = fc.features.find(
    (f) =>
      f.properties?.feedId === feedId &&
      (f.properties?.routeId === routeId ||
        f.properties?.routeShort === routeId) &&
      Number(f.properties?.direction ?? 0) === direction,
  );
  if (feature) return feature;
  return (
    fc.features.find(
      (f) =>
        f.properties?.feedId === feedId &&
        (f.properties?.routeId === routeId || f.properties?.routeShort === routeId),
    ) ?? null
  );
}

async function upcomingStops(
  feedId: string,
  tripId: string,
  fromSequence: number | undefined,
) {
  const stops = await getTripStops(feedId, tripId);
  if (!stops.length) return [];
  const startIdx =
    fromSequence != null
      ? stops.findIndex((s) => s.sequence >= fromSequence)
      : 0;
  const slice = startIdx >= 0 ? stops.slice(startIdx) : stops;
  return slice.map((s) => {
    const schedSec = gtfsTimeToSec(s.departureTime);
    const rt = getStopTripRt(feedId, tripId, s.stopId);
    const delaySec = rt?.delaySec;
    const predictedSec =
      rt?.predictedSec ?? (delaySec != null ? schedSec + delaySec : undefined);
    return {
      stop_id: s.stopId,
      name: s.name,
      sequence: s.sequence,
      scheduled: secToTime(schedSec % 86400),
      predicted:
        predictedSec != null ? secToTime(predictedSec % 86400) : undefined,
      platform: rt?.platform,
      delayMin: delaySec != null ? Math.round(delaySec / 60) : undefined,
    };
  });
}

export async function getDemoRun(feedId: string, vehicleId: string) {
  await ensureDemoAssets();

  const vehicle = getRtVehicles().find(
    (v) => v.feedId === feedId && v.vehicleId === vehicleId,
  );
  if (!vehicle || vehicle.lat == null || vehicle.lon == null) return null;

  const tripRt = vehicle.tripId ? getTripRt(feedId, vehicle.tripId) : undefined;
  const scheduleTrip = vehicle.tripId
    ? await lookupTripFromSchedules(feedId, vehicle.tripId)
    : undefined;
  const routeId = vehicle.routeId ?? tripRt?.routeId ?? scheduleTrip?.routeId;
  const route = await findRouteMeta(feedId, routeId);
  const shape = findShape(feedId, routeId);
  const headsign = scheduleTrip?.headsign ?? null;

  const upcoming = vehicle.tripId
    ? await upcomingStops(feedId, vehicle.tripId, vehicle.currentStopSequence)
    : [];
  const currentStop = upcoming[0] ?? null;
  const nextStops = upcoming.slice(1, 12);

  return {
    vehicle: {
      id: vehicle.vehicleId,
      label: vehicle.label?.trim() || vehicle.vehicleId,
      lat: vehicle.lat,
      lon: vehicle.lon,
      bearing: vehicle.bearing ?? null,
      delayMin: tripRt?.delaySec != null ? Math.round(tripRt.delaySec / 60) : null,
      updatedAt: new Date().toISOString(),
    },
    trip: vehicle.tripId
      ? {
          trip_id: vehicle.tripId,
          route_id: routeId ?? "",
          headsign,
          block_id: null,
        }
      : null,
    route: route
      ? {
          short_name: route.short_name,
          long_name: route.long_name,
          color: route.color,
        }
      : scheduleTrip
        ? {
            short_name: scheduleTrip.routeShort,
            long_name: scheduleTrip.headsign,
            color: scheduleTrip.routeColor,
          }
        : null,
    currentStop: currentStop
      ? { stop_id: currentStop.stop_id, name: currentStop.name }
      : null,
    upcomingStops: nextStops,
    blockTrips: [],
    shape,
  };
}

export function resolveDemoStop(groupId: string) {
  const id = resolveStopGroupId(groupId);
  return getGroupedDemoStops()[id];
}
