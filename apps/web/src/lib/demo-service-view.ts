import { ensureDemoStopAssets } from "./demo";
import { ensureDemoAssets, loadDemoAssets } from "./demo-assets";
import { routeColor } from "./colors";
import {
  gtfsTimeToSec,
  normalizeServiceSec,
  torontoNowSec,
} from "./calendar";
import { delayMinFromSec } from "./departures";
import { getDemoRoutesGeoJson } from "./demo-routes";
import { resolveStopGroupForMember } from "./demo-stop-groups";
import type { ScheduleRow } from "./demo-schedule-types";
import { lookupRouteFromSchedules } from "./demo-trip-lookup";
import {
  pickScheduleTripId,
  resolveDemoTrip,
} from "./demo-trip-resolve";
import { buildDemoTripStops, type TripStopOut } from "./demo-trip-stops";
import {
  headsignFromWarmIndex,
  needsHeadsignLookup,
  preloadTripHeadsignIndex,
  tripHeadsign,
} from "./demo-trip-headsign";
import { boardDestination } from "./headsign";
import { fetchGoTrainDetail, type GoTrainDetail } from "./go-metrolinx-rest";
import { displayRouteShort, isMetrolinxRailFeed, goLineCode } from "./go-rail";
import { resolveVehicleBlock } from "./demo-trip-meta";
import {
  getRtVehicle,
  getTripDelaySec,
  getTripRt,
  normalizeMetrolinxKey,
} from "./rt-cache";

const OCCUPANCY_LABELS: Record<number, string> = {
  0: "Empty",
  1: "Many seats available",
  2: "Few seats available",
  3: "Standing room only",
  4: "Crushed standing room",
  5: "Full",
  6: "Not accepting passengers",
  7: "No data",
};

export type ServiceStop = {
  stop_id: string;
  name: string;
  sequence?: number;
  scheduled: string;
  predicted?: string;
  platform?: string;
  delayMin?: number;
  groupId?: string;
  passed?: boolean;
  current?: boolean;
};

export type ServiceViewData = {
  vehicle: {
    id: string;
    label: string;
    lat: number | null;
    lon: number | null;
    bearing?: number | null;
    speed?: number | null;
    occupancy?: string;
    delayMin: number | null;
    updatedAt?: string;
  } | null;
  trip: {
    trip_id: string;
    schedule_trip_id?: string | null;
    route_id: string;
    headsign: string | null;
    block_id?: string | null;
  } | null;
  route: {
    short_name: string | null;
    long_name: string | null;
    color: string;
  } | null;
  currentStop: { stop_id: string; name: string; groupId?: string } | null;
  tripStops: ServiceStop[];
  blockTrips: Array<{
    trip_id: string;
    headsign: string | null;
    first_departure: string;
    last_departure?: string;
    active: boolean;
  }>;
  blockStart: string | null;
  blockEnd: string | null;
  trainDetail: GoTrainDetail | null;
  shape: GeoJSON.Feature | null;
};

async function findRouteMeta(feedId: string, routeId: string | undefined) {
  if (!routeId) return null;
  const { core } = loadDemoAssets();
  for (const agency of core.filterTree.agencies) {
    if (agency.id !== feedId) continue;
    for (const mode of agency.modes) {
      const r = mode.routes.find((x) => x.id === routeId || x.shortName === routeId);
      if (r) {
        return {
          short_name: displayRouteShort(r.shortName),
          long_name: r.longName,
          color: routeColor(feedId, r.shortName, null, r.id),
        };
      }
    }
  }
  const sample = await lookupRouteFromSchedules(feedId, routeId);
  if (sample) {
    return {
      short_name: displayRouteShort(sample.routeShort),
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
      (f.properties?.routeId === routeId || f.properties?.routeShort === routeId) &&
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

function tripStopToService(s: TripStopOut): ServiceStop {
  return {
    stop_id: s.stopId,
    name: s.name,
    sequence: s.sequence,
    scheduled: s.scheduled,
    predicted: s.predicted,
    platform: s.platform,
    delayMin: s.delayMin,
    groupId: s.groupId,
    passed: s.passed,
  };
}

function inferCurrentStopIndex(
  stops: ServiceStop[],
  fromSequence: number | undefined,
): number {
  if (fromSequence != null) {
    const idx = stops.findIndex((s) => s.sequence === fromSequence);
    if (idx >= 0) return idx;
  }
  const now = torontoNowSec();
  let bestIdx = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]!;
    const sec = normalizeServiceSec(
      gtfsTimeToSec(s.predicted ?? s.scheduled),
      now,
    );
    const delta = now - sec;
    if (delta >= -60 && delta < bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function markCurrentStop(stops: ServiceStop[], currentIdx: number): ServiceStop[] {
  return stops.map((s, i) => ({
    ...s,
    current: i === currentIdx,
    passed: s.passed || (currentIdx >= 0 && i < currentIdx),
  }));
}

async function loadTrainDetail(
  feedId: string,
  routeShort: string | null | undefined,
  tripId: string | undefined,
): Promise<GoTrainDetail | null> {
  if (!tripId || !isMetrolinxRailFeed(feedId, goLineCode(routeShort))) return null;
  const key = normalizeMetrolinxKey(process.env.METROLINX_API_KEY);
  if (!key) return null;
  return Promise.race([
    fetchGoTrainDetail(tripId, key),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 900)),
  ]);
}

async function assembleTripPayload(
  feedId: string,
  liveTripId: string,
  scheduleTripId: string | undefined,
  scheduleRow: ScheduleRow | undefined,
  opts?: { fromStop?: string; fromSequence?: number; vehicle?: ReturnType<typeof getRtVehicle> },
): Promise<{
  tripStops: ServiceStop[];
  currentStop: ServiceViewData["currentStop"];
  block: Awaited<ReturnType<typeof resolveVehicleBlock>>;
  headsign: string | null;
  routeId: string;
  route: ServiceViewData["route"];
  shape: GeoJSON.Feature | null;
  trainDetail: GoTrainDetail | null;
  delayMin: number | null;
}> {
  const schedId = scheduleTripId ?? liveTripId;
  const routeId = scheduleRow?.routeId ?? getTripRt(feedId, liveTripId)?.routeId ?? "";

  const routeShortGuess =
    scheduleRow?.routeShort ?? getTripRt(feedId, liveTripId)?.routeId ?? "";

  const [route, rawStops, block, warmHeadsign, headsignLookup, trainDetail] =
    await Promise.all([
      findRouteMeta(feedId, routeId),
      buildDemoTripStops({
        feedId,
        liveTripId,
        scheduleTripId: schedId,
        fromStop: opts?.fromStop,
      }),
      resolveVehicleBlock(feedId, liveTripId, schedId),
      Promise.resolve(headsignFromWarmIndex(feedId, liveTripId)),
      headsignFromWarmIndex(feedId, liveTripId)
        ? Promise.resolve(null)
        : tripHeadsign(feedId, liveTripId),
      loadTrainDetail(feedId, routeShortGuess, liveTripId),
    ]);

  const headsignRaw =
    (scheduleRow?.headsign?.trim() && !needsHeadsignLookup(scheduleRow.headsign)
      ? scheduleRow.headsign.trim()
      : null) ??
    warmHeadsign ??
    headsignLookup ??
    route?.long_name ??
    null;
  const headsign = headsignRaw
    ? boardDestination(
        feedId,
        route?.short_name ?? scheduleRow?.routeShort,
        headsignRaw,
      ) || headsignRaw
    : null;

  const tripStops = markCurrentStop(
    rawStops.map(tripStopToService),
    inferCurrentStopIndex(
      rawStops.map(tripStopToService),
      opts?.fromSequence ?? opts?.vehicle?.currentStopSequence ?? undefined,
    ),
  );
  const currentIdx = tripStops.findIndex((s) => s.current);
  const currentStop =
    currentIdx >= 0
      ? {
          stop_id: tripStops[currentIdx]!.stop_id,
          name: tripStops[currentIdx]!.name,
          groupId: tripStops[currentIdx]!.groupId,
        }
      : null;

  const delaySec =
    getTripDelaySec(feedId, liveTripId) ??
    getTripRt(feedId, liveTripId)?.delaySec ??
    opts?.vehicle?.delaySec;

  const routeShort = route?.short_name ?? scheduleRow?.routeShort ?? null;

  return {
    tripStops,
    currentStop,
    block,
    headsign,
    routeId,
    route:
      route ??
      (scheduleRow
        ? {
            short_name: displayRouteShort(scheduleRow.routeShort),
            long_name: scheduleRow.headsign,
            color: scheduleRow.routeColor,
          }
        : null),
    shape: findShape(feedId, routeId),
    trainDetail,
    delayMin: delayMinFromSec(delaySec) ?? null,
  };
}

export async function getDemoServiceView(
  feedId: string,
  opts: {
    vehicleId?: string;
    tripId?: string;
    fromStop?: string;
    scheduleTrip?: string;
  },
): Promise<ServiceViewData | null> {
  await ensureDemoStopAssets();
  const { ensureRtCacheWithin } = await import("./rt-cache");
  await Promise.all([
    ensureRtCacheWithin(3500),
    preloadTripHeadsignIndex(feedId),
    ensureDemoAssets(),
  ]);

  if (opts.vehicleId) {
    const vehicle = getRtVehicle(feedId, opts.vehicleId);
    if (!vehicle) return null;
    if (!vehicle.tripId && (vehicle.lat == null || vehicle.lon == null)) return null;

    const liveTripId = vehicle.tripId;
    if (!liveTripId) {
      return {
        vehicle: {
          id: vehicle.vehicleId,
          label: vehicle.label?.trim() || vehicle.vehicleId,
          lat: vehicle.lat ?? null,
          lon: vehicle.lon ?? null,
          bearing: vehicle.bearing ?? null,
          speed: vehicle.speed ?? null,
          occupancy: OCCUPANCY_LABELS[vehicle.occupancyStatus ?? 7] ?? "No data",
          delayMin: delayMinFromSec(vehicle.delaySec) ?? null,
          updatedAt: new Date().toISOString(),
        },
        trip: null,
        route: null,
        currentStop: null,
        tripStops: [],
        blockTrips: [],
        blockStart: null,
        blockEnd: null,
        trainDetail: null,
        shape: null,
      };
    }

    const resolved = await resolveDemoTrip(feedId, liveTripId);
    const scheduleTripId = resolved.scheduleTripId;
    const payload = await assembleTripPayload(
      feedId,
      liveTripId,
      scheduleTripId,
      resolved.scheduleRow,
      { vehicle },
    );

    return {
      vehicle: {
        id: vehicle.vehicleId,
        label: vehicle.label?.trim() || vehicle.vehicleId,
        lat: vehicle.lat ?? null,
        lon: vehicle.lon ?? null,
        bearing: vehicle.bearing ?? null,
        speed: vehicle.speed ?? null,
        occupancy: OCCUPANCY_LABELS[vehicle.occupancyStatus ?? 7] ?? "No data",
        delayMin: payload.delayMin,
        updatedAt: new Date().toISOString(),
      },
      trip: {
        trip_id: liveTripId,
        schedule_trip_id: scheduleTripId ?? null,
        route_id: payload.routeId,
        headsign: payload.headsign,
        block_id: payload.block.blockId,
      },
      route: payload.route,
      currentStop: payload.currentStop,
      tripStops: payload.tripStops,
      blockTrips: payload.block.blockTrips,
      blockStart: payload.block.blockStart,
      blockEnd: payload.block.blockEnd,
      trainDetail: payload.trainDetail,
      shape: payload.shape,
    };
  }

  if (!opts.tripId) return null;

  try {
  const resolved = await resolveDemoTrip(feedId, opts.tripId);
  const liveTripId = resolved.liveTripId;
  const scheduleTripId = await pickScheduleTripId(
    feedId,
    liveTripId,
    opts.scheduleTrip,
    resolved,
  );
  const tripRt = getTripRt(feedId, liveTripId);
  const rtVehicle = tripRt?.vehicleId
    ? getRtVehicle(feedId, tripRt.vehicleId)
    : undefined;

  const payload = await assembleTripPayload(
    feedId,
    liveTripId,
    scheduleTripId,
    resolved.scheduleRow,
    { fromStop: opts.fromStop, vehicle: rtVehicle },
  );

  return {
    vehicle: rtVehicle
      ? {
          id: rtVehicle.vehicleId,
          label: rtVehicle.label?.trim() || rtVehicle.vehicleId,
          lat: rtVehicle.lat ?? null,
          lon: rtVehicle.lon ?? null,
          bearing: rtVehicle.bearing ?? null,
          speed: rtVehicle.speed ?? null,
          occupancy: OCCUPANCY_LABELS[rtVehicle.occupancyStatus ?? 7] ?? "No data",
          delayMin: payload.delayMin,
          updatedAt: new Date().toISOString(),
        }
      : null,
    trip: {
      trip_id: liveTripId,
      schedule_trip_id: scheduleTripId ?? null,
      route_id: payload.routeId,
      headsign: payload.headsign,
      block_id: payload.block.blockId,
    },
    route: payload.route,
    currentStop: payload.currentStop,
    tripStops: payload.tripStops,
    blockTrips: payload.block.blockTrips,
    blockStart: payload.block.blockStart,
    blockEnd: payload.block.blockEnd,
    trainDetail: payload.trainDetail,
    shape: payload.shape,
  };
  } catch {
    return null;
  }
}

/** @deprecated Use getDemoServiceView({ vehicleId }) */
export async function getDemoRun(feedId: string, vehicleId: string) {
  const data = await getDemoServiceView(feedId, { vehicleId });
  if (!data?.vehicle) return null;
  return {
    ...data,
    upcomingStops: data.tripStops.filter((s) => !s.passed && !s.current).slice(0, 12),
  };
}
