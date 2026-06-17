import { formatInTimeZone } from "date-fns-tz";

const TZ = "America/Toronto";

export function serviceDate(d = new Date()): string {
  return formatInTimeZone(d, TZ, "yyyyMMdd");
}

export function weekdayIndex(d = new Date()): number {
  const day = formatInTimeZone(d, TZ, "i");
  return Number(day) % 7;
}

const DAY_COLS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function activeServiceSql(feedId: string, date: string) {
  if (!/^[a-z0-9_]+$/.test(feedId) || !/^\d{8}$/.test(date)) {
    throw new Error("Invalid activeServiceSql parameters");
  }
  const wd = weekdayIndex(new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8)),
  ));
  const col = DAY_COLS[wd];
  return `
    t.service_id IN (
      SELECT service_id FROM calendar c
      WHERE c.feed_id = '${feedId}'
        AND c.${col} = true
        AND c.start_date <= '${date}'
        AND c.end_date >= '${date}'
      UNION
      SELECT service_id FROM calendar_dates cd
      WHERE cd.feed_id = '${feedId}' AND cd.date = '${date}' AND cd.exception_type = 1
    )
    AND t.service_id NOT IN (
      SELECT service_id FROM calendar_dates cd
      WHERE cd.feed_id = '${feedId}' AND cd.date = '${date}' AND cd.exception_type = 2
    )
  `;
}

export function gtfsTimeToSec(t: string): number {
  const parts = t.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return h * 3600 + m * 60 + s;
}

export function timeToSec(t: string): number {
  return gtfsTimeToSec(t);
}

export function secToTime(sec: number): string {
  const s = ((sec % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** GTFS allows hours ≥ 24 for post-midnight service (e.g. 25:30). */
export function formatGtfsTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const SERVICE_ROLLOVER_SEC = 3 * 3600;
const LATE_NIGHT_END_SEC = 6 * 3600;
const EVENING_START_SEC = 18 * 3600;
const SAME_DAY_GAP_SEC = 12 * 3600;

/** Normalize a departure second-of-day into upcoming service context. */
export function normalizeServiceSec(schedSec: number, now: number): number {
  // GTFS post-midnight times (24:00+ = same service night as 00:00–03:00 clock times).
  if (schedSec >= 86400) {
    const clockSec = schedSec % 86400;
    if (now > clockSec + 180 && now - clockSec < 20 * 3600) {
      return clockSec;
    }
    return schedSec;
  }

  // After midnight, compare clock times directly (don't roll 02:00 to tomorrow when it's past).
  if (schedSec < LATE_NIGHT_END_SEC && now < LATE_NIGHT_END_SEC) {
    return schedSec;
  }

  // Before dawn, evening departures are from the previous service day.
  if (now < LATE_NIGHT_END_SEC && schedSec >= EVENING_START_SEC) {
    return schedSec - 86400;
  }

  // Morning now with an evening clock time → previous night (e.g. 23:00 at 07:00).
  if (schedSec - now > SAME_DAY_GAP_SEC) {
    return schedSec - 86400;
  }

  let depSec = schedSec;
  for (let i = 0; i < 3; i++) {
    if (depSec >= now - 120) break;
    depSec += 86400;
  }
  if (depSec > now + 48 * 3600) depSec -= 86400;
  return depSec;
}

/** 0 = tonight, 1+ = next service day(s) for board dividers. */
export function serviceDayOffset(normSec: number, now: number): number {
  const nowBucket = Math.floor((now - SERVICE_ROLLOVER_SEC) / 86400);
  const depBucket = Math.floor((normSec - SERVICE_ROLLOVER_SEC) / 86400);
  return Math.max(0, depBucket - nowBucket);
}

export function formatBoardTime(
  sec: number,
  now = torontoNowSec(),
): { time: string; dayOffset: number } {
  const norm = normalizeServiceSec(sec, now);
  const dayOffset = serviceDayOffset(norm, now);
  const clockSec = ((norm % 86400) + 86400) % 86400;
  return { time: secToTime(clockSec), dayOffset };
}

/** GTFS stop_times strings may use hours ≥ 24 (e.g. 28:30 → 04:30). */
export function formatGtfsDepartureTime(t: string, now = torontoNowSec()): string {
  return formatBoardTime(gtfsTimeToSec(t), now).time;
}

export function nowSec(): number {
  return torontoNowSec();
}

export function displayTripClockTime(sec: number): string {
  return secToTime(((sec % 86400) + 86400) % 86400);
}

/** Preserve GTFS trip ordering across midnight (e.g. 23:50 → 24:10 → 01:00). */
export function makeMonotonicGtfsSecs(secs: number[]): number[] {
  if (!secs.length) return [];
  const out = [secs[0]!];
  for (let i = 1; i < secs.length; i++) {
    let s = secs[i]!;
    while (s + 600 < out[i - 1]!) s += 86400;
    out.push(s);
  }
  return out;
}

/** Align a live prediction onto the same service-day axis as its scheduled stop. */
export function alignPredictionToSchedule(
  predictedSec: number,
  schedSec: number,
): number {
  let p = predictedSec;
  if (isUnixTimestamp(p)) p = unixToTorontoSec(p);
  while (p + 600 < schedSec) p += 86400;
  while (p > schedSec + 30 * 3600) p -= 86400;
  return p;
}

/** Shift an entire trip timeline when the first stop's live time differs from schedule encoding. */
export function shiftTripToPrediction(
  monoSecs: number[],
  predictedSec: number,
): number[] {
  if (!monoSecs.length) return monoSecs;
  const alignedPred = alignPredictionToSchedule(predictedSec, monoSecs[0]!);
  const shift = alignedPred - monoSecs[0]!;
  if (shift !== 0 && Math.abs(shift) <= 12 * 3600) {
    return monoSecs.map((s) => s + shift);
  }
  return monoSecs;
}

export function torontoNowSec(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 3600 + get("minute") * 60 + get("second");
}

export function unixToTorontoSec(unix: number): number {
  return torontoNowSec(new Date(unix * 1000));
}

export function isUnixTimestamp(n: number): boolean {
  return n > 1_000_000_000;
}
