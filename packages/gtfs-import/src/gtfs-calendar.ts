const TZ = "America/Toronto";

const DAY_COLS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function torontoServiceDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/-/g, "");
}

export function torontoWeekdayIndex(d = new Date()): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
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

export function timeToSec(t: string): number {
  const parts = t.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return (h % 24) * 3600 + m * 60 + s;
}

export function secToTime(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type CalendarRow = {
  service_id: string;
  start_date: string;
  end_date: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
};

type CalendarDateRow = { service_id: string; date: string; exception_type: string };

export function loadActiveServices(
  calendarRows: CalendarRow[],
  calendarDateRows: CalendarDateRow[],
  date: string,
): Set<string> {
  const wd = torontoWeekdayIndex(
    new Date(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))),
  );
  const col = DAY_COLS[wd];
  const active = new Set<string>();

  for (const c of calendarRows) {
    if (c.start_date <= date && c.end_date >= date && c[col] === "1") {
      active.add(c.service_id);
    }
  }
  for (const cd of calendarDateRows) {
    if (cd.date !== date) continue;
    if (cd.exception_type === "1") active.add(cd.service_id);
    if (cd.exception_type === "2") active.delete(cd.service_id);
  }
  return active;
}
