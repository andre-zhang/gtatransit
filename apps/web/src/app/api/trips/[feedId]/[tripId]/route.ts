import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  alignPredictionToSchedule,
  displayTripClockTime,
  gtfsTimeToSec,
  makeMonotonicGtfsSecs,
  normalizeServiceSec,
  shiftTripToPrediction,
  torontoNowSec,
} from "@/lib/calendar";
import { computeDelaySec, delayMinFromSec } from "@/lib/departures";
import { routeColor } from "@/lib/colors";
import { useDemoFixtures } from "@/lib/demo-mode";
import { loadDemoTripPayload } from "@/lib/load-demo-trip";
import { stopGroupIdFor } from "@/lib/stop-group-href";
import { ensureRtCache, getStopTripRt, getTripRt } from "@/lib/rt-cache";

export { dynamic, maxDuration } from "@/lib/api-config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ feedId: string; tripId: string }> },
) {
  const { feedId, tripId } = await params;
  const fromStop = req.nextUrl.searchParams.get("fromStop") ?? undefined;
  const scheduleTripParam = req.nextUrl.searchParams.get("scheduleTrip") ?? undefined;

  if (await useDemoFixtures()) {
    try {
      const payload = await loadDemoTripPayload(feedId, tripId, {
        fromStop,
        scheduleTrip: scheduleTripParam,
      });
      return NextResponse.json(payload);
    } catch {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  const db = getSql();
  const tripMeta = await db<
    Array<{ headsign: string | null; route_id: string | null }>
  >`
    SELECT headsign, route_id FROM trips WHERE feed_id = ${feedId} AND trip_id = ${tripId} LIMIT 1
  `;
  const rows = await db<
    Array<{
      stop_id: string;
      name: string;
      stop_sequence: number;
      arrival_time: string;
      departure_time: string;
    }>
  >`
    SELECT st.stop_id, s.name, st.stop_sequence, st.arrival_time, st.departure_time
    FROM stop_times st
    JOIN stops s ON s.feed_id = st.feed_id AND s.stop_id = st.stop_id
    WHERE st.feed_id = ${feedId} AND st.trip_id = ${tripId}
    ORDER BY st.stop_sequence
  `;

  const tripRt = getTripRt(feedId, tripId);
  const now = torontoNowSec();
  const headsign = tripMeta[0]?.headsign ?? null;
  const lastRow = rows[rows.length - 1];
  const tripEnded =
    !tripRt &&
    lastRow != null &&
    normalizeServiceSec(gtfsTimeToSec(lastRow.departure_time), now) < now - 300;
  const startIdx =
    fromStop != null && !tripEnded
      ? rows.findIndex((r) => r.stop_id === fromStop)
      : 0;
  const slice = startIdx >= 0 ? rows.slice(startIdx) : rows;
  const routeRow = tripMeta[0]?.route_id
    ? await db<
        Array<{ route_id: string; short_name: string | null; color: string | null }>
      >`
        SELECT route_id, short_name, color FROM routes
        WHERE feed_id = ${feedId} AND route_id = ${tripMeta[0]!.route_id}
        LIMIT 1
      `
    : [];
  const routeInfo = routeRow[0];

  const groupIds = new Map<string, string>();
  await Promise.all(
    slice.map(async (s) => {
      const gid = await stopGroupIdFor(feedId, s.stop_id);
      if (gid) groupIds.set(s.stop_id, gid);
    }),
  );

  const rawSecs = slice.map((s) => gtfsTimeToSec(s.departure_time));
  let monoSecs = makeMonotonicGtfsSecs(rawSecs);
  const firstRt = slice[0] ? getStopTripRt(feedId, tripId, slice[0].stop_id) : undefined;
  if (firstRt?.predictedSec != null) {
    monoSecs = shiftTripToPrediction(monoSecs, firstRt.predictedSec);
  }

  return NextResponse.json({
    tripId,
    feedId,
    fromStop,
    headsign,
    vehicleId: tripRt?.vehicleId,
    route: routeInfo
      ? {
          routeId: routeInfo.route_id,
          shortName: routeInfo.short_name ?? routeInfo.route_id,
          color: routeColor(feedId, routeInfo.short_name, routeInfo.color),
        }
      : null,
    stops: slice.map((s, idx) => {
      const schedSec = monoSecs[idx]!;
      const rt = getStopTripRt(feedId, tripId, s.stop_id);
      const delaySec = computeDelaySec(schedSec, {
        predictedSec: rt?.predictedSec,
        agencyDelaySec: rt?.delaySec,
        now,
      });
      let predictedSec: number | undefined;
      if (rt?.predictedSec != null) {
        predictedSec = alignPredictionToSchedule(rt.predictedSec, schedSec);
      } else if (delaySec != null) {
        predictedSec = schedSec + delaySec;
      }
      return {
        stopId: s.stop_id,
        name: s.name,
        sequence: s.stop_sequence,
        scheduled: displayTripClockTime(schedSec),
        predicted:
          predictedSec != null ? displayTripClockTime(predictedSec) : undefined,
        delayMin: delayMinFromSec(delaySec),
        groupId: groupIds.get(s.stop_id),
        passed: tripEnded && normalizeServiceSec(schedSec, now) < now - 60,
      };
    }),
  });
}
