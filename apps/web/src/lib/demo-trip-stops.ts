import {
  alignPredictionToSchedule,
  displayTripClockTime,
  gtfsTimeToSec,
  isUnixTimestamp,
  makeMonotonicGtfsSecs,
  shiftTripToPrediction,
  torontoNowSec,
  unixToTorontoSec,
} from "./calendar";import { computeDelaySec, delayMinFromSec } from "./departures";
import { loadDemoAssets } from "./demo-assets";
import { getTripStops } from "./demo-schedules";
import { expandGoStopId, goStopIdsMatch } from "./go-stop-aliases";
import {
  fixtureStopIdForLive,
  liveStopDisplayName,
  resolveTtcRtStopIds,
} from "./ttc-stop-registry";
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

async function resolveFromStopCandidates(
  feedId: string,
  fromStop: string,
): Promise<Set<string>> {
  const ids = new Set<string>([fromStop]);
  if (feedId === "go") {
    for (const id of expandGoStopId(fromStop)) ids.add(id);
    return ids;
  }
  if (feedId === "ttc") {
    for (const id of await resolveTtcRtStopIds([{ feedId: "ttc", stopId: fromStop }])) {
      ids.add(id);
    }
    const fixture = await fixtureStopIdForLive(fromStop);
    if (fixture) ids.add(fixture);
  }
  return ids;
}

function findStopIndex(
  stops: Array<{ stopId: string }>,
  candidates: Set<string>,
  feedId: string,
): number {
  return stops.findIndex((s) => {
    if (candidates.has(s.stopId)) return true;
    if (feedId === "go") {
      for (const id of candidates) {
        if (goStopIdsMatch(id, s.stopId)) return true;
      }
    }
    return false;
  });
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

  const schedStops = await getTripStops(feedId, scheduleTripId);
  const fromCandidates =
    fromStop != null ? await resolveFromStopCandidates(feedId, fromStop) : null;

  if (schedStops.length) {
    const startIdx =
      fromCandidates != null ? findStopIndex(schedStops, fromCandidates, feedId) : 0;
    const slice = startIdx >= 0 ? schedStops.slice(startIdx) : schedStops;
    const baseSeq = startIdx >= 0 ? schedStops[startIdx]!.sequence : 0;
    const rawSecs = slice.map((s) => gtfsTimeToSec(s.departureTime));
    let monoSecs = makeMonotonicGtfsSecs(rawSecs);
    const firstRt = await rtForFixtureStop(feedId, liveTripId, slice[0]!.stopId);
    if (firstRt?.predictedSec != null) {
      monoSecs = shiftTripToPrediction(monoSecs, firstRt.predictedSec);
    }
    return Promise.all(
      slice.map(async (s, idx) => {
        const schedSec = monoSecs[idx]!;
        const rt = await rtForFixtureStop(feedId, liveTripId, s.stopId);
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
          stopId: s.stopId,
          name: s.name,
          sequence: s.sequence,
          scheduled: displayTripClockTime(schedSec),
          predicted:
            predictedSec != null ? displayTripClockTime(predictedSec) : undefined,
          delayMin: delayMinFromSec(delaySec),
          passed:
            fromCandidates != null &&
            startIdx >= 0 &&
            s.sequence < baseSeq,
        };
      }),
    );
  }

  if (!rtUpdates.length) return [];

  const startIdx =
    fromCandidates != null
      ? rtUpdates.findIndex((u) => {
          if (fromCandidates.has(u.stopId)) return true;
          if (feedId === "go") {
            for (const id of fromCandidates) {
              if (goStopIdsMatch(id, u.stopId)) return true;
            }
          }
          return false;
        })
      : 0;
  const slice = startIdx >= 0 ? rtUpdates.slice(startIdx) : rtUpdates;
  const baseSeq = startIdx >= 0 ? startIdx + 1 : 1;

  return Promise.all(
    slice.map(async (u, i) => {
      const name =
        feedId === "ttc"
          ? ((await liveStopDisplayName(u.stopId)) ?? stopName(feedId, u.stopId))
          : stopName(feedId, u.stopId);
      const schedSec =
        u.predictedSec != null
          ? isUnixTimestamp(u.predictedSec)
            ? unixToTorontoSec(u.predictedSec)
            : u.predictedSec
          : now;
      return {
        stopId: u.stopId,
        name,
        sequence: baseSeq + i,
        scheduled: displayTripClockTime(schedSec),
        predicted: displayTripClockTime(schedSec),
        delayMin: u.delaySec != null ? Math.round(u.delaySec / 60) : undefined,
      };
    }),
  );
}
