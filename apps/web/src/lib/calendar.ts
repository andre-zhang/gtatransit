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
