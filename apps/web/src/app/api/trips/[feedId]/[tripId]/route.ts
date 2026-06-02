import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isUnixTimestamp, gtfsTimeToSec, secToTime, unixToTorontoSec } from "@/lib/calendar";
import { useDemoFixtures } from "@/lib/demo-mode";
import { getTripStops } from "@/lib/demo-schedules";
import { getStopTripRt, getTripRt, refreshRtCache } from "@/lib/rt-cache";

export { dynamic, maxDuration } from "@/lib/api-config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ feedId: string; tripId: string }> },
) {
  const { feedId, tripId } = await params;
  const fromStop = req.nextUrl.searchParams.get("fromStop") ?? undefined;
  await refreshRtCache();

  if (await useDemoFixtures()) {
    const stops = getTripStops(feedId, tripId);
    if (!stops.length) {
      return NextResponse.json({ tripId, feedId, stops: [], fromStop });
    }

    const startIdx =
      fromStop != null ? stops.findIndex((s) => s.stopId === fromStop) : 0;
    const slice = startIdx >= 0 ? stops.slice(startIdx) : stops;
    const tripRt = getTripRt(feedId, tripId);

    return NextResponse.json({
      tripId,
      feedId,
      fromStop,
      vehicleId: tripRt?.vehicleId,
      stops: slice.map((s) => {
        const schedSec = gtfsTimeToSec(s.departureTime);
        const rt = getStopTripRt(feedId, tripId, s.stopId);
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
          stopId: s.stopId,
          name: s.name,
          sequence: s.sequence,
          scheduled: secToTime(schedSec % 86400),
          predicted:
            predictedSec != null ? secToTime(predictedSec % 86400) : undefined,
          delayMin: delaySec != null ? Math.round(delaySec / 60) : undefined,
          platform: rt?.platform,
          passed: fromStop != null && s.sequence < (stops[startIdx]?.sequence ?? 0),
        };
      }),
    });
  }

  const db = getSql();
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

  const startIdx =
    fromStop != null ? rows.findIndex((r) => r.stop_id === fromStop) : 0;
  const slice = startIdx >= 0 ? rows.slice(startIdx) : rows;
  const tripRt = getTripRt(feedId, tripId);

  return NextResponse.json({
    tripId,
    feedId,
    fromStop,
    vehicleId: tripRt?.vehicleId,
    stops: slice.map((s) => {
      const schedSec = gtfsTimeToSec(s.departure_time);
      const rt = getStopTripRt(feedId, tripId, s.stop_id);
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
        stopId: s.stop_id,
        name: s.name,
        sequence: s.stop_sequence,
        scheduled: secToTime(schedSec % 86400),
        predicted:
          predictedSec != null ? secToTime(predictedSec % 86400) : undefined,
        delayMin: delaySec != null ? Math.round(delaySec / 60) : undefined,
        platform: feedId === "go" ? rt?.platform : undefined,
      };
    }),
  });
}
