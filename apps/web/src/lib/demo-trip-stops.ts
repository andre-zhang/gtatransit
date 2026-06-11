import {
  formatBoardTime,
  gtfsTimeToSec,
  normalizeServiceSec,
  secToTime,
  torontoNowSec,
} from "./calendar";
import { computeDelaySec, delayMinFromSec } from "./departures";
import { loadDemoAssets } from "./demo-assets";
import { getTripStops } from "./demo-schedules";
import { liveStopDisplayName, resolveTtcRtStopIds } from "./ttc-stop-registry";
import { expandGoStopId } from "./go-stop-aliases";
import { getStopTripRt, getTripStopUpdates } from "./rt-cache";

export type TripStopOut = {
  stopId: string;
  name: string;
  sequence: number;
  scheduled: string;
  predicted?: string;
  delayMin?: number;
  platform?: string;
  passed?: boolean;
};

function stopName(feedId: string, stopId: string): string {
  const meta = loadDemoAssets().stopMeta[feedId] as
    | Record<string, { name: string }>
    | undefined;
  return meta?.[stopId]?.name ?? stopId;
}

async function rtForFixtureStop(
  feedId: string,
  liveTripId: string,
  fixtureStopId: string,
) {
  const liveIds =
    feedId === "ttc"
      ? await resolveTtcRtStopIds([{ feedId: "ttc", stopId: fixtureStopId }])
      : expandGoStopId(fixtureStopId);
  for (const liveId of liveIds) {
    const rt = getStopTripRt(feedId, liveTripId, liveId);
    if (rt) return rt;
  }
  return undefined;
}

export async function buildDemoTripStops(opts: {
  feedId: string;
  liveTripId: string;
  scheduleTripId?: string;
  fromStop?: string;
}): Promise<TripStopOut[]> {
  const { feedId, liveTripId, fromStop } = opts;
  const scheduleTripId = opts.scheduleTripId ?? liveTripId;
  const now = torontoNowSec();
  const rtUpdates = getTripStopUpdates(feedId, liveTripId);
  const rtByLiveId = new Map(rtUpdates.map((u) => [u.stopId, u]));

  const schedStops = await getTripStops(feedId, scheduleTripId);

  if (schedStops.length) {
    const startIdx =
      fromStop != null ? schedStops.findIndex((s) => s.stopId === fromStop) : 0;
    const slice = startIdx >= 0 ? schedStops.slice(startIdx) : schedStops;
    return Promise.all(
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
        const schedFmt = formatBoardTime(schedSec, now);
        const predFmt =
          predictedSec != null ? formatBoardTime(predictedSec, now) : null;
        return {
          stopId: s.stopId,
          name: s.name,
          sequence: s.sequence,
          scheduled: schedFmt.time,
          predicted: predFmt?.time,
          delayMin: delayMinFromSec(delaySec),
          platform: rt?.platform,
          passed:
            fromStop != null && s.sequence < (schedStops[startIdx]?.sequence ?? 0),
        };
      }),
    );
  }

  if (!rtUpdates.length) return [];

  const startIdx =
    fromStop != null
      ? rtUpdates.findIndex((u) => {
          if (u.stopId === fromStop) return true;
          return expandGoStopId(fromStop).includes(u.stopId);
        })
      : 0;
  const slice = startIdx >= 0 ? rtUpdates.slice(startIdx) : rtUpdates;

  return Promise.all(
    slice.map(async (u) => {
      const name =
        feedId === "ttc"
          ? ((await liveStopDisplayName(u.stopId)) ?? stopName(feedId, u.stopId))
          : stopName(feedId, u.stopId);
      const schedSec = u.predictedSec ?? now;
      const fmt = formatBoardTime(schedSec, now);
      return {
        stopId: u.stopId,
        name,
        sequence: 0,
        scheduled: fmt.time,
        predicted: fmt.time,
        platform: u.platform,
        delayMin: u.delaySec != null ? Math.round(u.delaySec / 60) : undefined,
      };
    }),
  );
}
