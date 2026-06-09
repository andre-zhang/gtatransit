import {
  formatBoardTime,
  isUnixTimestamp,
  normalizeServiceSec,
  secToTime,
  torontoNowSec,
  gtfsTimeToSec,
  unixToTorontoSec,
} from "./calendar";

export { gtfsTimeToSec, secToTime };

export type DepartureInput = {
  tripId: string;
  feedId: string;
  routeId: string;
  routeShort: string;
  routeColor: string;
  destination: string;
  departureTime: string;
  stopId?: string;
  platform?: string;
  delaySec?: number | null;
  predictedSec?: number | null;
  realtime?: boolean;
  vehicleId?: string;
};

export type DepartureRowOut = {
  time: string;
  predicted?: string;
  routeShort: string;
  routeColor: string;
  destination: string;
  feedId: string;
  routeId: string;
  tripId: string;
  stopId?: string;
  platform?: string;
  vehicleId?: string;
  delayMin?: number;
  latenessMin?: number;
  realtime: boolean;
  dayOffset?: number;
};

export function filterUpcomingDepartures(
  rows: DepartureInput[],
  opts?: { limit?: number; pastGraceSec?: number },
): DepartureRowOut[] {
  const now = torontoNowSec();
  const pastGrace = opts?.pastGraceSec ?? 120;
  const limit = opts?.limit ?? 80;

  const mapped = rows
    .map((r) => {
      const schedSec = gtfsTimeToSec(r.departureTime);
      const schedNorm = normalizeServiceSec(schedSec, now);
      let depSec = schedSec;
      let realtime = r.realtime ?? false;
      let delaySec = r.delaySec ?? null;

      if (r.predictedSec != null) {
        depSec = isUnixTimestamp(r.predictedSec)
          ? unixToTorontoSec(r.predictedSec)
          : r.predictedSec;
        realtime = true;
      } else if (delaySec != null) {
        depSec = schedSec + delaySec;
        realtime = true;
      }

      depSec = normalizeServiceSec(depSec, now);
      if (depSec < now - pastGrace) return null;

      // Compare live prediction to scheduled time — don't trust agency delay=0 alone.
      if (realtime) {
        const drift = depSec - schedNorm;
        if (delaySec == null || Math.abs(drift) > Math.abs(delaySec)) {
          delaySec = drift;
        }
      }

      const delayMin =
        delaySec != null ? Math.round(delaySec / 60) : undefined;
      const latenessMin =
        delayMin != null && realtime ? delayMin : undefined;

      const schedDisplay = formatBoardTime(schedSec, now);
      const predDisplay = realtime ? formatBoardTime(depSec, now) : null;

      return {
        depSec,
        time: schedDisplay.time,
        predicted: predDisplay?.time,
        dayOffset: predDisplay?.dayOffset ?? schedDisplay.dayOffset,
        routeShort: r.routeShort,
        routeColor: r.routeColor,
        destination: r.destination,
        feedId: r.feedId,
        routeId: r.routeId,
        tripId: r.tripId,
        stopId: r.stopId,
        platform: r.platform,
        vehicleId: r.vehicleId,
        delayMin,
        latenessMin,
        realtime,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.depSec - b.depSec)
    .slice(0, limit);

  return mapped.map(({ depSec: _, ...rest }) => rest);
}
