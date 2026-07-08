import { serviceDate, weekdayIndex } from "./calendar";
import { readDemoJsonFile } from "./demo-read";
import type { ScheduleRow } from "./demo-schedule-types";

const DAY_COLS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

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

type CalendarDateRow = {
  service_id: string;
  date: string;
  exception_type: string;
};

type FeedCalendar = {
  calendar: CalendarRow[];
  calendarDates: CalendarDateRow[];
};

const calendarCache = new Map<string, FeedCalendar>();
const activeCache = new Map<string, Set<string>>();

const CALENDAR_FEEDS = new Set(["yrt", "brampton", "drt"]);

export function feedUsesRuntimeCalendar(feedId: string): boolean {
  return CALENDAR_FEEDS.has(feedId);
}

async function loadFeedCalendar(feedId: string): Promise<FeedCalendar | null> {
  const hit = calendarCache.get(feedId);
  if (hit) return hit;
  try {
    const data = await readDemoJsonFile<FeedCalendar>(`${feedId}-calendar.json`);
    calendarCache.set(feedId, data);
    return data;
  } catch {
    return null;
  }
}

export function activeServiceIds(
  feedId: string,
  cal: FeedCalendar,
  date = serviceDate(),
): Set<string> {
  const cacheKey = `${feedId}:${date}`;
  const hit = activeCache.get(cacheKey);
  if (hit) return hit;

  const wd = weekdayIndex(
    new Date(
      Number(date.slice(0, 4)),
      Number(date.slice(4, 6)) - 1,
      Number(date.slice(6, 8)),
    ),
  );
  const col = DAY_COLS[wd]!;
  const active = new Set<string>();

  for (const c of cal.calendar) {
    if (c.start_date <= date && c.end_date >= date && c[col] === "1") {
      active.add(c.service_id);
    }
  }
  for (const cd of cal.calendarDates) {
    if (cd.date !== date) continue;
    if (cd.exception_type === "1") active.add(cd.service_id);
    if (cd.exception_type === "2") active.delete(cd.service_id);
  }

  // GTFS calendar.txt expires between demo builds — keep weekday patterns working.
  if (active.size === 0) {
    for (const c of cal.calendar) {
      if (c[col] === "1") active.add(c.service_id);
    }
    for (const cd of cal.calendarDates) {
      if (cd.exception_type !== "1") continue;
      const exWd = weekdayIndex(
        new Date(
          Number(cd.date.slice(0, 4)),
          Number(cd.date.slice(4, 6)) - 1,
          Number(cd.date.slice(6, 8)),
        ),
      );
      if (exWd === wd) active.add(cd.service_id);
    }
  }

  activeCache.set(cacheKey, active);
  return active;
}

export async function filterRowsByServiceDate(
  feedId: string,
  rows: ScheduleRow[],
  date = serviceDate(),
): Promise<ScheduleRow[]> {
  if (!feedUsesRuntimeCalendar(feedId) || !rows.length) return rows;
  const cal = await loadFeedCalendar(feedId);
  if (!cal) return rows;
  const active = activeServiceIds(feedId, cal, date);
  if (!active.size) return rows;
  let filtered = rows.filter((r) => active.has(r.serviceId));
  if (!filtered.length && rows.length) {
    // Calendar pattern mismatch — prefer showing schedule over an empty board.
    return rows;
  }
  return filtered;
}
