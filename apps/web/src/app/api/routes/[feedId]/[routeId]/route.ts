import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { activeServiceSql, serviceDate } from "@/lib/calendar";
import { routeColor } from "@/lib/colors";
import { useDemoForFeed } from "@/lib/demo-schedule-feeds";
import { loadDemoRouteDetail } from "@/lib/load-demo-route";
import { routesMatch } from "@/lib/route-match";
import { ensureRtCacheWithin } from "@/lib/rt-cache";
import { jsonWithCache } from "@/lib/api-cache";

export { dynamic, maxDuration } from "@/lib/api-config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ feedId: string; routeId: string }> },
) {
  const { feedId, routeId } = await params;
  const direction = Number(req.nextUrl.searchParams.get("direction") ?? 0);
  if (await useDemoForFeed(feedId)) {
    const detail = await loadDemoRouteDetail(feedId, routeId, direction);
    if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return jsonWithCache(detail, 20);
  }
  await ensureRtCacheWithin(2000);

  const db = getSql();
  const date = serviceDate();
  const serviceFilter = activeServiceSql(feedId, date);

  const routes = await db<
    Array<{ short_name: string | null; long_name: string | null; route_type: number; color: string | null }>
  >`SELECT short_name, long_name, route_type, color FROM routes WHERE feed_id = ${feedId} AND route_id = ${routeId}`;
  const route = routes[0];
  if (!route) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const trips = await db<
    Array<{ trip_id: string; headsign: string | null; direction_id: number | null; first_departure: string }>
  >`
    SELECT t.trip_id, t.headsign, t.direction_id,
           (SELECT MIN(st.departure_time) FROM stop_times st WHERE st.feed_id = t.feed_id AND st.trip_id = t.trip_id) AS first_departure
    FROM trips t
    WHERE t.feed_id = ${feedId} AND t.route_id = ${routeId}
      AND COALESCE(t.direction_id, 0) = ${direction}
      AND ${db.unsafe(serviceFilter)}
    ORDER BY first_departure
    LIMIT 200
  `;

  const vehicleRows = await db<
    Array<{
      vehicle_id: string;
      label: string | null;
      lat: number;
      lon: number;
      route_id: string | null;
      headsign: string | null;
      delay_sec: number | null;
    }>
  >`
    SELECT v.vehicle_id, v.label, v.lat, v.lon, v.route_id, t.headsign, v.delay_sec
    FROM rt_vehicles v
    LEFT JOIN trips t ON t.feed_id = v.feed_id AND t.trip_id = v.trip_id
    WHERE v.feed_id = ${feedId}
      AND v.lat IS NOT NULL AND v.updated_at > NOW() - INTERVAL '5 minutes'
  `;

  const vehicles = vehicleRows
    .filter((v) => routesMatch(feedId, routeId, route.short_name, v.route_id ?? undefined))
    .slice(0, 80)
    .map(({ route_id: _, ...v }) => v);

  const shapes = await db<Array<{ geojson: string }>>`
    SELECT geojson FROM route_shapes
    WHERE feed_id = ${feedId} AND route_id = ${routeId} AND direction_id = ${direction}
  `;

  return NextResponse.json({
    route: {
      ...route,
      color: routeColor(feedId, route.short_name, route.color),
    },
    direction,
    trips,
    vehicles,
    shape: shapes[0]?.geojson ? JSON.parse(shapes[0].geojson) : null,
  });
}
