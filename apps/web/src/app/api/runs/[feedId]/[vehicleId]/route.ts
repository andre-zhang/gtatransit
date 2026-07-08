import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  activeServiceSql,
  gtfsTimeToSec,
  isUnixTimestamp,
  secToTime,
  serviceDate,
  unixToTorontoSec,
} from "@/lib/calendar";
import { routeColor } from "@/lib/colors";
import { useDemoForFeed } from "@/lib/demo-schedule-feeds";
import { getDemoServiceView } from "@/lib/demo-service-view";
import { ensureRtCache, getStopTripRt } from "@/lib/rt-cache";

export { dynamic, maxDuration } from "@/lib/api-config";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ feedId: string; vehicleId: string }> },
) {
  const { feedId, vehicleId } = await params;

  if (await useDemoForFeed(feedId)) {
    const run = await getDemoServiceView(feedId, { vehicleId });
    if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(run);
  }

  const db = getSql();
  const date = serviceDate();
  await ensureRtCache();

  const vehicles = await db<
    Array<{
      vehicle_id: string;
      trip_id: string | null;
      route_id: string | null;
      label: string | null;
      lat: number | null;
      lon: number | null;
      bearing: number | null;
      delay_sec: number | null;
      current_stop_sequence: number | null;
      updated_at: Date;
    }>
  >`
    SELECT * FROM rt_vehicles WHERE feed_id = ${feedId} AND vehicle_id = ${vehicleId}
  `;
  const v = vehicles[0];
  if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let trip = null;
  let route = null;
  let blockTrips: Array<{
    trip_id: string;
    headsign: string | null;
    first_departure: string;
    last_departure?: string;
    active: boolean;
  }> = [];

  if (v.trip_id) {
    const trips = await db<
      Array<{ trip_id: string; route_id: string; headsign: string | null; block_id: string | null }>
    >`SELECT trip_id, route_id, headsign, block_id FROM trips WHERE feed_id = ${feedId} AND trip_id = ${v.trip_id}`;
    trip = trips[0];
    if (trip) {
      const routes = await db<
        Array<{ short_name: string | null; long_name: string | null; color: string | null }>
      >`SELECT short_name, long_name, color FROM routes WHERE feed_id = ${feedId} AND route_id = ${trip.route_id}`;
      route = routes[0];

      if (trip.block_id) {
        const serviceFilter = activeServiceSql(feedId, date);
        const rawBlockTrips = await db<
          Array<{
            trip_id: string;
            headsign: string | null;
            first_departure: string;
            last_departure: string | null;
            active: boolean;
          }>
        >`
          SELECT t.trip_id, t.headsign,
                 (SELECT MIN(st.departure_time) FROM stop_times st WHERE st.feed_id = t.feed_id AND st.trip_id = t.trip_id) AS first_departure,
                 (SELECT MAX(st.departure_time) FROM stop_times st WHERE st.feed_id = t.feed_id AND st.trip_id = t.trip_id) AS last_departure,
                 (t.trip_id = ${v.trip_id}) AS active
          FROM trips t
          WHERE t.feed_id = ${feedId} AND t.block_id = ${trip.block_id}
            AND ${db.unsafe(serviceFilter)}
          ORDER BY first_departure
        `;
        blockTrips = rawBlockTrips
          .filter((row) => row.first_departure)
          .map((row) => ({
            trip_id: row.trip_id,
            headsign: row.headsign,
            first_departure: String(row.first_departure).slice(0, 5),
            last_departure: row.last_departure
              ? String(row.last_departure).slice(0, 5)
              : undefined,
            active: row.active,
          }));
        if (blockTrips.length <= 1) blockTrips = [];
      }
    }
  }

  const blockStart = blockTrips[0]?.first_departure ?? null;
  const blockLast = blockTrips[blockTrips.length - 1];
  const blockEnd = blockLast
    ? (blockLast.last_departure ?? blockLast.first_departure)
    : null;

  let currentStop = null;
  if (v.trip_id && v.current_stop_sequence) {
    const stops = await db<Array<{ stop_id: string; name: string }>>`
      SELECT st.stop_id, s.name
      FROM stop_times st
      JOIN stops s ON s.feed_id = st.feed_id AND s.stop_id = st.stop_id
      WHERE st.feed_id = ${feedId} AND st.trip_id = ${v.trip_id}
        AND st.stop_sequence = ${v.current_stop_sequence}
    `;
    currentStop = stops[0] ?? null;
  }

  const shape = v.trip_id
    ? await db<Array<{ geojson: string }>>`
        SELECT rs.geojson FROM trips t
        JOIN route_shapes rs ON rs.feed_id = t.feed_id AND rs.route_id = t.route_id
          AND rs.direction_id = COALESCE(t.direction_id, 0)
        WHERE t.feed_id = ${feedId} AND t.trip_id = ${v.trip_id}
        LIMIT 1
      `
    : [];

  let upcomingStops: Array<{
    stop_id: string;
    name: string;
    scheduled: string;
    predicted?: string;
    platform?: string;
    delayMin?: number;
  }> = [];

  if (v.trip_id) {
    const stopRows = await db<
      Array<{
        stop_id: string;
        name: string;
        stop_sequence: number;
        departure_time: string;
      }>
    >`
      SELECT st.stop_id, s.name, st.stop_sequence, st.departure_time
      FROM stop_times st
      JOIN stops s ON s.feed_id = st.feed_id AND s.stop_id = st.stop_id
      WHERE st.feed_id = ${feedId} AND st.trip_id = ${v.trip_id}
      ORDER BY st.stop_sequence
    `;
    const fromSeq = v.current_stop_sequence ?? 0;
    upcomingStops = stopRows
      .filter((s) => s.stop_sequence > fromSeq)
      .slice(0, 12)
      .map((s) => {
        const schedSec = gtfsTimeToSec(s.departure_time);
        const rt = getStopTripRt(feedId, v.trip_id!, s.stop_id);
        const delaySec = rt?.delaySec;
        let predictedSec: number | undefined;
        if (rt?.predictedSec != null) {
          predictedSec = isUnixTimestamp(rt.predictedSec)
            ? unixToTorontoSec(rt.predictedSec)
            : rt.predictedSec;
        } else if (delaySec != null) {
          predictedSec = schedSec + delaySec;
        }
        return {
          stop_id: s.stop_id,
          name: s.name,
          scheduled: secToTime(schedSec % 86400),
          predicted:
            predictedSec != null ? secToTime(predictedSec % 86400) : undefined,
          platform: feedId === "go" ? rt?.platform : undefined,
          delayMin: delaySec != null ? Math.round(delaySec / 60) : undefined,
        };
      });
  }

  return NextResponse.json({
    vehicle: {
      id: v.vehicle_id,
      label: v.label,
      lat: v.lat,
      lon: v.lon,
      bearing: v.bearing,
      delayMin: v.delay_sec != null ? Math.round(v.delay_sec / 60) : null,
      updatedAt: v.updated_at,
    },
    trip,
    route: route
      ? {
          ...route,
          color: routeColor(feedId, route.short_name, route.color),
        }
      : null,
    currentStop,
    upcomingStops,
    blockTrips,
    blockStart,
    blockEnd,
    shape: shape[0]?.geojson ? JSON.parse(shape[0].geojson) : null,
  });
}
