import {
  alignPredictionToSchedule,
  displayTripClockTime,
  gtfsTimeToSec,
  isUnixTimestamp,
  makeMonotonicGtfsSecs,
  normalizeServiceSec,
  shiftTripToPrediction,
  torontoNowSec,
  unixToTorontoSec,
} from "./calendar";
import { computeDelaySec, delayMinFromSec } from "./departures";
import { loadDemoAssets } from "./demo-assets";
import { getTripStops } from "./demo-schedules";
import { expandGoStopId, goStopIdsMatch } from "./go-stop-aliases";
import {
  fixtureStopIdForLive,
  liveStopDisplayName,
  mapFixtureStopsToRt,
  resolveTtcRtStopIds,
} from "./ttc-stop-registry";
import { resolveStopGroupForMember } from "./demo-stop-groups";
import { getStopTripRt, getTripRt, getTripStopUpdates } from "./rt-cache";

export type TripStopOut = {
  stopId: string;
  name: string;
  sequence: number;
  scheduled: string;
  predicted?: string;
  delayMin?: number;
  platform?: string;
  passed?: boolean;
  groupId?: string;
};

function stopName(feedId: string, stopId: string): string {
  const meta = loadDemoAssets().stopMeta[feedId] as
    | Record<string, { name: string }>
    | undefined;
  return meta?.[stopId]?.name ?? stopId;
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
  sliceFromStop?: boolean;
}): Promise<TripStopOut[]> {
  const { feedId, liveTripId, fromStop } = opts;
  const scheduleTripId = opts.scheduleTripId ?? liveTripId;
  const now = torontoNowSec();
  const rtUpdates = getTripStopUpdates(feedId, liveTripId);

  const schedStops = await getTripStops(feedId, scheduleTripId);
  const fromCandidates =
    fromStop != null ? await resolveFromStopCandidates(feedId, fromStop) : null;

  const tripEnded =
    schedStops.length > 0 &&
    !getTripRt(feedId, liveTripId) &&
    rtUpdates.length === 0 &&
    (() => {
      const last = schedStops[schedStops.length - 1]!;
      const lastSec = gtfsTimeToSec(last.departureTime);
      return normalizeServiceSec(lastSec, now) < now - 300;
    })();

  const useFromStop = fromCandidates != null && !tripEnded;

  if (schedStops.length) {
    const startIdx = useFromStop
      ? findStopIndex(schedStops, fromCandidates!, feedId)
      : 0;
    const slice = opts.sliceFromStop && startIdx >= 0 ? schedStops.slice(startIdx) : schedStops;
    const baseSeq = startIdx >= 0 ? schedStops[startIdx]!.sequence : 0;
    const rawSecs = slice.map((s) => gtfsTimeToSec(s.departureTime));
    let monoSecs = makeMonotonicGtfsSecs(rawSecs);
    const rtByFixture = await mapFixtureStopsToRt(feedId, slice.map((s) => s.stopId), (liveId) =>
      getStopTripRt(feedId, liveTripId, liveId),
    );
    const firstRt = rtByFixture.get(slice[0]!.stopId);
    if (firstRt?.predictedSec != null) {
      monoSecs = shiftTripToPrediction(monoSecs, firstRt.predictedSec);
    }
    return slice.map((s, idx) => {
        const schedSec = monoSecs[idx]!;
        const rt = rtByFixture.get(s.stopId);
        const delaySec =
          rt?.predictedSec != null
            ? computeDelaySec(schedSec, {
                predictedSec: rt.predictedSec,
                agencyDelaySec: rt.delaySec,
                now,
              })
            : null;
        let predictedSec: number | undefined;
        if (rt?.predictedSec != null) {
          predictedSec = alignPredictionToSchedule(rt.predictedSec, schedSec);
        }
        const schedNorm = normalizeServiceSec(schedSec, now);
        return {
          stopId: s.stopId,
          name: s.name,
          sequence: s.sequence,
          scheduled: displayTripClockTime(schedSec),
          predicted:
            predictedSec != null ? displayTripClockTime(predictedSec) : undefined,
          delayMin: delayMinFromSec(delaySec),
          groupId: resolveStopGroupForMember(feedId, s.stopId) ?? undefined,
          passed: tripEnded
            ? schedNorm < now - 60
            : useFromStop && startIdx >= 0 && s.sequence < baseSeq,
        };
      });
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
  const slice = opts.sliceFromStop && startIdx >= 0 ? rtUpdates.slice(startIdx) : rtUpdates;
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
        delayMin: u.delaySec != null ? delayMinFromSec(u.delaySec) : undefined,
        groupId: resolveStopGroupForMember(feedId, u.stopId) ?? undefined,
      };
    }),
  );
}
