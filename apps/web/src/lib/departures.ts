import {
  formatBoardTime,
  isUnixTimestamp,
  normalizeServiceSec,
  secToTime,
  torontoNowSec,
  gtfsTimeToSec,
  unixToTorontoSec,
} from "./calendar";
import { goTripsMatch } from "./go-stop-aliases";

export { gtfsTimeToSec, secToTime };

function departureScore(row: DepartureInput): number {
  return (
    (row.platform ? 8 : 0) +
    (row.vehicleId ? 4 : 0) +
    (row.predictedSec != null ? 2 : 0) +
    (row.realtime ? 1 : 0)
  );
}

/** True when two board rows describe the same underlying trip. */
export function departuresOverlap(a: DepartureInput, b: DepartureInput): boolean {
  if (a.feedId !== b.feedId) return false;
  if (a.tripId === b.tripId) return true;
  if (a.scheduleTripId === b.tripId || b.scheduleTripId === a.tripId) return true;
  if (a.scheduleTripId && a.scheduleTripId === b.scheduleTripId) return true;
  if (a.feedId === "go") {
    if (goTripsMatch(a.tripId, b.tripId)) return true;
    if (a.scheduleTripId && goTripsMatch(a.scheduleTripId, b.tripId)) return true;
    if (b.scheduleTripId && goTripsMatch(a.tripId, b.scheduleTripId)) return true;
    if (a.scheduleTripId && b.scheduleTripId && goTripsMatch(a.scheduleTripId, b.scheduleTripId)) {
      return true;
    }
  }
  return false;
}

/** Drop scheduled rows when a live row exists for the same trip; collapse duplicate live rows. */
export function dedupeDepartures(rows: DepartureInput[]): DepartureInput[] {
  const live = rows.filter((r) => r.realtime);
  const scheduled = rows.filter((r) => !r.realtime);
  const keptScheduled = scheduled.filter((s) => !live.some((l) => departuresOverlap(s, l)));

  const keptLive: DepartureInput[] = [];
  for (const row of live) {
    const idx = keptLive.findIndex((k) => departuresOverlap(k, row));
    if (idx < 0) {
      keptLive.push(row);
      continue;
    }
    if (departureScore(row) > departureScore(keptLive[idx]!)) {
      keptLive[idx] = row;
    }
  }

  return [...keptLive, ...keptScheduled];
}

const MAX_DISPLAY_DELAY_SEC = 120 * 60;

/** Compare live prediction to schedule; don't trust agency delay=0 alone. */
export function computeDelaySec(
  schedSec: number,
  opts: {
    predictedSec?: number | null;
    agencyDelaySec?: number | null;
    now?: number;
  },
): number | null {
  const now = opts.now ?? torontoNowSec();
  const schedNorm = normalizeServiceSec(schedSec, now);
  let delaySec: number | null = null;
  if (
    opts.agencyDelaySec != null &&
    Math.abs(opts.agencyDelaySec) <= MAX_DISPLAY_DELAY_SEC
  ) {
    delaySec = opts.agencyDelaySec;
  }

  if (opts.predictedSec != null) {
    const pred = isUnixTimestamp(opts.predictedSec)
      ? unixToTorontoSec(opts.predictedSec)
      : opts.predictedSec;
    const drift = normalizeServiceSec(pred, now) - schedNorm;
    if (Math.abs(drift) > MAX_DISPLAY_DELAY_SEC) {
      return null;
    }
    if (delaySec == null || Math.abs(drift) > Math.abs(delaySec)) {
      delaySec = drift;
    }
  }

  return delaySec;
}

export function delayMinFromSec(delaySec: number | null | undefined): number | undefined {
  if (delaySec == null) return undefined;
  const min = Math.round(delaySec / 60);
  if (Math.abs(min) > 120) return undefined;
  return min;
}

export type DepartureInput = {
  tripId: string;
  /** Fixture schedule trip id when tripId is a live RT id. */
  scheduleTripId?: string;
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
  scheduleTripId?: string;
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

      if (realtime) {
        delaySec = computeDelaySec(schedSec, {
          predictedSec: r.predictedSec,
          agencyDelaySec: delaySec,
          now,
        });
        if (delaySec != null && r.predictedSec == null) {
          depSec = schedNorm + delaySec;
        }
      }

      const delayMin = delayMinFromSec(delaySec);
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
        scheduleTripId: r.scheduleTripId,
        stopId: r.stopId,
        platform: r.platform,
        vehicleId: r.vehicleId,
        delayMin,
        latenessMin,
        realtime,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.depSec - b.depSec);

  type MappedRow = (typeof mapped)[number];
  const asInput = (r: MappedRow): DepartureInput => ({
    tripId: r.tripId,
    scheduleTripId: r.scheduleTripId,
    feedId: r.feedId,
    routeId: r.routeId,
    routeShort: r.routeShort,
    routeColor: r.routeColor,
    destination: r.destination,
    departureTime: r.time,
    realtime: r.realtime,
  });

  const withoutScheduledDupes = mapped.filter((row) => {
    if (row.realtime) return true;
    return !mapped.some(
      (other) => other.realtime && departuresOverlap(asInput(row), asInput(other)),
    );
  });

  const deduped: MappedRow[] = [];
  for (const row of withoutScheduledDupes) {
    if (!row.realtime) {
      deduped.push(row);
      continue;
    }
    const idx = deduped.findIndex(
      (prev) => prev.realtime && departuresOverlap(asInput(prev), asInput(row)),
    );
    if (idx < 0) {
      deduped.push(row);
      continue;
    }
    const prev = deduped[idx]!;
    const score = (r: MappedRow) =>
      (r.platform ? 4 : 0) + (r.vehicleId ? 2 : 0) + (r.predicted ? 1 : 0);
    if (score(row) > score(prev)) deduped[idx] = row;
  }

  return deduped.slice(0, limit).map(({ depSec: _, ...rest }) => rest);
}
