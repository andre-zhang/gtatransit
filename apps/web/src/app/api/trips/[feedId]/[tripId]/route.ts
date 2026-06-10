import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  gtfsTimeToSec,
  normalizeServiceSec,
  secToTime,
  torontoNowSec,
} from "@/lib/calendar";
import { computeDelaySec, delayMinFromSec } from "@/lib/departures";
import { useDemoFixtures } from "@/lib/demo-mode";
import { resolveDemoTrip } from "@/lib/demo-trip-resolve";
import { tripHeadsign } from "@/lib/demo-trip-headsign";
import { getTripStops } from "@/lib/demo-schedules";
import { getStopTripRt, getTripRt, refreshRtCache } from "@/lib/rt-cache";
import { resolveTtcRtStopIds } from "@/lib/ttc-stop-registry";

export { dynamic, maxDuration } from "@/lib/api-config";

async function rtForFixtureStop(
  feedId: string,
  liveTripId: string,
  fixtureStopId: string,
) {
  const liveIds =
    feedId === "ttc"
      ? await resolveTtcRtStopIds([{ feedId: "ttc", stopId: fixtureStopId }])
      : [fixtureStopId];
  for (const liveId of liveIds) {
    const rt = getStopTripRt(feedId, liveTripId, liveId);
    if (rt) return rt;
  }
  return undefined;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ feedId: string; tripId: string }> },
) {
  const { feedId, tripId } = await params;
  const fromStop = req.nextUrl.searchParams.get("fromStop") ?? undefined;
  await refreshRtCache();

  if (await useDemoFixtures()) {
    const { ensureDemoAssets } = await import("@/lib/demo-assets");
    await ensureDemoAssets();

    const resolved = await resolveDemoTrip(feedId, tripId);
    const scheduleTripId = resolved.scheduleTripId ?? tripId;
    const liveTripId = resolved.liveTripId;
    const stops = await getTripStops(feedId, scheduleTripId);
    if (!stops.length) {
      return NextResponse.json({ tripId, feedId, stops: [], fromStop });
    }

    const startIdx =
      fromStop != null ? stops.findIndex((s) => s.stopId === fromStop) : 0;
    const slice = startIdx >= 0 ? stops.slice(startIdx) : stops;
    const tripRt = getTripRt(feedId, liveTripId);
    const now = torontoNowSec();
    const headsign = await tripHeadsign(feedId, liveTripId);

    return NextResponse.json({
      tripId,
      feedId,
      fromStop,
      headsign,
      vehicleId: tripRt?.vehicleId,
      stops: await Promise.all(
        slice.map(async (s) => {
          const schedSec = gtfsTimeToSec(s.departureTime);
          const rt = await rtForFixtureStop(feedId, liveTripId, s.stopId);
          const delaySec = computeDelaySec(schedSec, {
            predictedSec: rt?.predictedSec,
            agencyDelaySec: rt?.delaySec,
            now,
          });
          let predictedSec: number | undefined;
          if (rt?.predictedSec != null) {
            predictedSec = normalizeServiceSec(rt.predictedSec, now);
          } else if (delaySec != null) {
            predictedSec = normalizeServiceSec(schedSec + delaySec, now);
          }
          return {
            stopId: s.stopId,
            name: s.name,
            sequence: s.sequence,
            scheduled: secToTime(schedSec % 86400),
            predicted:
              predictedSec != null ? secToTime(predictedSec % 86400) : undefined,
            delayMin: delayMinFromSec(delaySec),
            platform: rt?.platform,
            passed:
              fromStop != null && s.sequence < (stops[startIdx]?.sequence ?? 0),
          };
        }),
      ),
    });
  }

  const db = getSql();
  const tripMeta = await db<Array<{ headsign: string | null }>>`
    SELECT headsign FROM trips WHERE feed_id = ${feedId} AND trip_id = ${tripId} LIMIT 1
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

  const startIdx =
    fromStop != null ? rows.findIndex((r) => r.stop_id === fromStop) : 0;
  const slice = startIdx >= 0 ? rows.slice(startIdx) : rows;
  const tripRt = getTripRt(feedId, tripId);
  const now = torontoNowSec();
  const headsign = tripMeta[0]?.headsign ?? null;

  return NextResponse.json({
    tripId,
    feedId,
    fromStop,
    headsign,
    vehicleId: tripRt?.vehicleId,
    stops: slice.map((s) => {
      const schedSec = gtfsTimeToSec(s.departure_time);
      const rt = getStopTripRt(feedId, tripId, s.stop_id);
      const delaySec = computeDelaySec(schedSec, {
        predictedSec: rt?.predictedSec,
        agencyDelaySec: rt?.delaySec,
        now,
      });
      let predictedSec: number | undefined;
      if (rt?.predictedSec != null) {
        predictedSec = normalizeServiceSec(rt.predictedSec, now);
      } else if (delaySec != null) {
        predictedSec = normalizeServiceSec(schedSec + delaySec, now);
      }
      return {
        stopId: s.stop_id,
        name: s.name,
        sequence: s.stop_sequence,
        scheduled: secToTime(schedSec % 86400),
        predicted:
          predictedSec != null ? secToTime(predictedSec % 86400) : undefined,
        delayMin: delayMinFromSec(delaySec),
        platform: feedId === "go" ? rt?.platform : undefined,
      };
    }),
  });
}
