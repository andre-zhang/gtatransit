import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  filterUpcomingDepartures,
  gtfsTimeToSec,
  type DepartureInput,
} from "@/lib/departures";
import { activeServiceSql, isUnixTimestamp, secToTime, serviceDate, unixToTorontoSec } from "@/lib/calendar";
import { routeColor } from "@/lib/colors";
import { getDemoCore, useDemoFixtures } from "@/lib/demo";
import { getStopSchedule } from "@/lib/demo-schedules";
import { lookupTripFromSchedules } from "@/lib/demo-trip-lookup";
import { resolveStopGroupId } from "@/lib/demo-stop-groups";
import {
  getRtPredictionsForStop,
  mergeRtIntoDeparture,
  refreshRtCache,
} from "@/lib/rt-cache";

export { dynamic, maxDuration } from "@/lib/api-config";

function routeMetaFromCore(feedId: string, routeId: string | undefined) {
  if (!routeId) return null;
  for (const agency of getDemoCore().filterTree.agencies) {
    if (agency.id !== feedId) continue;
    for (const mode of agency.modes) {
      const r = mode.routes.find((x) => x.id === routeId || x.shortName === routeId);
      if (r) {
        return {
          routeShort: r.shortName,
          routeColor: routeColor(feedId, r.shortName, null),
          destination: r.longName,
        };
      }
    }
  }
  return null;
}

async function rtPredictionToDeparture(
  row: Awaited<ReturnType<typeof getRtPredictionsForStop>>[number],
): Promise<DepartureInput | null> {
  const tripRow = await lookupTripFromSchedules(row.feedId, row.tripId);
  const routeId = row.routeId ?? tripRow?.routeId;
  const coreMeta = routeMetaFromCore(row.feedId, routeId);
  let predictedSec = row.predictedSec;
  if (predictedSec != null && isUnixTimestamp(predictedSec)) {
    predictedSec = unixToTorontoSec(predictedSec);
  }
  if (predictedSec == null && row.delaySec == null) return null;

  const schedSec = predictedSec ?? gtfsTimeToSec(secToTime((Date.now() / 1000) % 86400));
  return {
    tripId: row.tripId,
    feedId: row.feedId,
    routeId: routeId ?? "",
    routeShort: tripRow?.routeShort ?? coreMeta?.routeShort ?? routeId ?? "?",
    routeColor: routeColor(
      row.feedId,
      tripRow?.routeShort ?? coreMeta?.routeShort ?? null,
      tripRow?.routeColor ?? null,
    ),
    destination: tripRow?.headsign ?? coreMeta?.destination ?? "In service",
    departureTime: secToTime(schedSec % 86400),
    stopId: row.stopId,
    delaySec: row.delaySec,
    predictedSec: predictedSec ?? undefined,
    realtime: true,
    vehicleId: row.vehicleId,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params;

  if (await useDemoFixtures()) {
    const { ensureDemoAssets } = await import("@/lib/demo-assets");
    await ensureDemoAssets();
    await refreshRtCache(true);
    const resolved = resolveStopGroupId(groupId);
    const stop = getDemoCore().stops[resolved];
    if (!stop) return NextResponse.json({ name: "Stop", rows: [] });

    const schedule = await getStopSchedule(resolved);
    const memberStopIds = stop.members.map((m) => m.stopId);
    const inputs: DepartureInput[] = schedule.map((r) => {
      const schedSec = gtfsTimeToSec(r.departureTime);
      const rt = mergeRtIntoDeparture(r.feedId, r.tripId, r.stopId, schedSec, memberStopIds);
      return {
        tripId: r.tripId,
        feedId: r.feedId,
        routeId: r.routeId,
        routeShort: r.routeShort,
        routeColor: r.routeColor,
        destination: r.headsign,
        departureTime: r.departureTime,
        stopId: r.stopId,
        platform: r.feedId === "go" ? rt.platform : undefined,
        delaySec: rt.delaySec,
        predictedSec: rt.predictedSec,
        realtime: rt.realtime,
        vehicleId: rt.vehicleId,
      };
    });

    const seenTrips = new Set(inputs.map((r) => `${r.feedId}:${r.tripId}`));
    const feedsSeen = new Set<string>();
    for (const m of stop.members) {
      if (feedsSeen.has(m.feedId)) continue;
      feedsSeen.add(m.feedId);
      const idsForFeed = stop.members
        .filter((x) => x.feedId === m.feedId)
        .map((x) => x.stopId);
      const extras = getRtPredictionsForStop(m.feedId, idsForFeed, seenTrips);
      for (const extra of extras) {
        seenTrips.add(`${extra.feedId}:${extra.tripId}`);
        const row = await rtPredictionToDeparture(extra);
        if (row) inputs.push(row);
      }
    }

    return NextResponse.json({
      name: stop.name,
      rows: filterUpcomingDepartures(inputs),
    });
  }

  await refreshRtCache(true);
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

  const inputs: DepartureInput[] = allRows.map((r) => {
    const schedSec = gtfsTimeToSec(r.departure_time);
    const rt = mergeRtIntoDeparture(r.feed_id, r.trip_id, r.stop_id, schedSec);
    const delaySec = r.delay_sec ?? rt.delaySec;
    const realtime = delaySec != null || rt.realtime;
    return {
      tripId: r.trip_id,
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
