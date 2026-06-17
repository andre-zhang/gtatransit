import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  filterUpcomingDepartures,
  gtfsTimeToSec,
  type DepartureInput,
} from "@/lib/departures";
import { activeServiceSql, secToTime, serviceDate } from "@/lib/calendar";
import { routeColor } from "@/lib/colors";
import { useDemoFixtures } from "@/lib/demo";
import { loadDemoStopMeta } from "@/lib/demo-stop-meta";
import { resolveStopGroupId } from "@/lib/demo-stop-groups";
import { buildDemoStopDepartures } from "@/lib/stop-departures";
import { getCachedStopBoard, setCachedStopBoard } from "@/lib/stop-board-cache";
import { ensureRtCache, mergeRtIntoDeparture } from "@/lib/rt-cache";

export { dynamic, maxDuration } from "@/lib/api-config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params;
  const quick = req.nextUrl.searchParams.get("quick") === "1";

  if (await useDemoFixtures()) {
    try {
      const stop = await loadDemoStopMeta(groupId);
      const resolved = resolveStopGroupId(groupId);
      const cached = getCachedStopBoard(resolved, quick);
      if (cached) return NextResponse.json(cached);

      if (!stop) return NextResponse.json({ name: "Stop", rows: [] });

      const board = await buildDemoStopDepartures(resolved, stop, { quick });
      setCachedStopBoard(resolved, quick, board);
      return NextResponse.json(board);
    } catch (err) {
      console.error("[departures]", groupId, err);
      return NextResponse.json({ name: "Stop", rows: [], error: "load_failed" }, { status: 500 });
    }
  }

  await ensureRtCache();
  const db = getSql();
  const date = serviceDate();

  const members = await db<Array<{ feed_id: string; stop_id: string }>>`
    SELECT feed_id, stop_id FROM stop_group_members WHERE group_id = ${groupId}
  `;
  if (!members.length) return NextResponse.json({ rows: [], name: "" });

  const group = await db<Array<{ name: string }>>`
    SELECT name FROM stop_groups WHERE id = ${groupId}
  `;

  type Row = {
    feed_id: string;
    trip_id: string;
    route_id: string;
    departure_time: string;
    headsign: string | null;
    short_name: string | null;
    color: string | null;
    stop_id: string;
    delay_sec: number | null;
  };

  const allRows: Row[] = [];
  for (const m of members) {
    const serviceFilter = activeServiceSql(m.feed_id, date);
    const rows = await db<Row[]>`
      SELECT st.feed_id, st.trip_id, t.route_id, st.departure_time, t.headsign,
             r.short_name, r.color, st.stop_id,
             rt.delay_sec
      FROM stop_times st
      JOIN trips t ON t.feed_id = st.feed_id AND t.trip_id = st.trip_id
      JOIN routes r ON r.feed_id = t.feed_id AND r.route_id = t.route_id
      LEFT JOIN rt_trip_updates rt ON rt.feed_id = st.feed_id AND rt.trip_id = st.trip_id AND rt.stop_id = st.stop_id
      WHERE st.feed_id = ${m.feed_id} AND st.stop_id = ${m.stop_id}
        AND ${db.unsafe(serviceFilter)}
    `;
    allRows.push(...rows);
  }

  const memberStopIds = members.map((m) => m.stop_id);
  const usedRtTrips = new Set<string>();
  const inputs: DepartureInput[] = allRows.map((r) => {
    const schedSec = gtfsTimeToSec(r.departure_time);
    const rt = mergeRtIntoDeparture(
      r.feed_id,
      r.trip_id,
      r.stop_id,
      schedSec,
      memberStopIds,
      {
        routeId: r.route_id,
        routeShort: r.short_name ?? r.route_id,
        usedRtTrips,
      },
    );
    const delaySec = r.delay_sec ?? rt.delaySec;
    const realtime = delaySec != null || rt.realtime;
    return {
      tripId: rt.liveTripId ?? r.trip_id,
      feedId: r.feed_id,
      routeId: r.route_id,
      routeShort: r.short_name ?? r.route_id,
      routeColor: routeColor(r.feed_id, r.short_name, r.color),
      destination: r.headsign ?? "",
      departureTime: r.departure_time,
      stopId: r.stop_id,
      platform: r.feed_id === "go" ? rt.platform : undefined,
      delaySec,
      predictedSec:
        rt.predictedSec ?? (delaySec != null ? schedSec + delaySec : undefined),
      realtime,
      vehicleId: rt.vehicleId,
    };
  });

  return NextResponse.json({
    name: group[0]?.name ?? "",
    rows: filterUpcomingDepartures(inputs),
  });
}
