import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";
import { parseMapFilters, vehicleMatchesFilters } from "@/lib/demo-map-filters";
import { filterPointCollection, mapQueryParams } from "@/lib/geojson-map";
import { routeColor } from "@/lib/colors";
import { getRtVehicles, refreshRtCache } from "@/lib/rt-cache";
import { vehicleCollection } from "@/lib/vehicle-geojson";
import { parseDirs, parseList } from "@/lib/parse-filters";

export { dynamic, maxDuration } from "@/lib/api-config";

export async function GET(req: NextRequest) {
  const { bbox } = mapQueryParams(req.nextUrl.searchParams);

  if (isDemoMode()) {
    await refreshRtCache();
    const filters = parseMapFilters(req.nextUrl.searchParams);
    const vehicles = getRtVehicles().filter((v) => vehicleMatchesFilters(v, filters));
    const fc = vehicleCollection(
      vehicles
        .filter((v) => v.lat != null && v.lon != null)
        .map((v) => ({
          lon: v.lon!,
          lat: v.lat!,
          feedId: v.feedId,
          vehicleId: v.vehicleId,
          label: v.label,
          routeId: v.routeId,
          delaySec: v.delaySec,
          bearing: v.bearing,
        })),
    );
    return NextResponse.json(filterPointCollection(fc, bbox));
  }

  const agencies = parseList(req.nextUrl.searchParams.get("agencies"));
  const dirs = parseDirs(req.nextUrl.searchParams.get("directions"));

  const db = getSql();
  const rawRows = await db<
    Array<{
      feed_id: string;
      vehicle_id: string;
      trip_id: string | null;
      route_id: string | null;
      label: string | null;
      lat: number;
      lon: number;
      bearing: number | null;
      delay_sec: number | null;
      direction_id: number | null;
    }>
  >`
    SELECT v.feed_id, v.vehicle_id, v.trip_id, v.route_id, v.label,
           v.lat, v.lon, v.bearing, v.delay_sec, t.direction_id
    FROM rt_vehicles v
    LEFT JOIN trips t ON t.feed_id = v.feed_id AND t.trip_id = v.trip_id
    WHERE v.lat IS NOT NULL AND v.updated_at > NOW() - INTERVAL '5 minutes'
  `;

  let rows = [...rawRows];
  if (agencies.length) rows = rows.filter((r) => agencies.includes(r.feed_id));
  if (dirs.length) rows = rows.filter((r) => r.direction_id == null || dirs.includes(r.direction_id));

  const fc = vehicleCollection(
    rows.map((r) => ({
      lon: r.lon,
      lat: r.lat,
      feedId: r.feed_id,
      vehicleId: r.vehicle_id,
      label: r.label,
      routeId: r.route_id,
      delaySec: r.delay_sec,
      bearing: r.bearing,
    })),
  );

  return NextResponse.json(filterPointCollection(fc, bbox));
}
