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

  let depSec = schedSec;
  for (let i = 0; i < 3; i++) {
    if (depSec >= now - 120) break;
    depSec += 86400;
  }
  if (depSec > now + 36 * 3600) depSec -= 86400;
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
  const time = sec >= 86400 ? formatGtfsTime(sec) : secToTime(sec % 86400);
  return { time, dayOffset };
}

export function nowSec(): number {
  return torontoNowSec();
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
