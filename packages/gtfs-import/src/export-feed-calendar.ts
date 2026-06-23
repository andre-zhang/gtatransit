import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pick, readCsv } from "./csv.js";

export type FeedCalendarExport = {
  calendar: Array<{
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
  }>;
  calendarDates: Array<{
    service_id: string;
    date: string;
    exception_type: string;
  }>;
};

export async function readFeedCalendar(dir: string): Promise<FeedCalendarExport> {
  const calendar: FeedCalendarExport["calendar"] = [];
  const calendarPath = join(dir, "calendar.txt");
  if (existsSync(calendarPath)) {
    for await (const row of readCsv(calendarPath)) {
      calendar.push({
        service_id: pick(row, "service_id"),
        start_date: pick(row, "start_date"),
        end_date: pick(row, "end_date"),
        monday: pick(row, "monday"),
        tuesday: pick(row, "tuesday"),
        wednesday: pick(row, "wednesday"),
        thursday: pick(row, "thursday"),
        friday: pick(row, "friday"),
        saturday: pick(row, "saturday"),
        sunday: pick(row, "sunday"),
      });
    }
  }

  const calendarDates: FeedCalendarExport["calendarDates"] = [];
  const calendarDatesPath = join(dir, "calendar_dates.txt");
  if (existsSync(calendarDatesPath)) {
    for await (const row of readCsv(calendarDatesPath)) {
      calendarDates.push({
        service_id: pick(row, "service_id"),
        date: pick(row, "date"),
        exception_type: pick(row, "exception_type"),
      });
    }
  }

  return { calendar, calendarDates };
}

export async function exportFeedCalendar(
  feedId: string,
  dir: string,
  outDir: string,
): Promise<FeedCalendarExport> {
  const data = await readFeedCalendar(dir);
  writeFileSync(join(outDir, `${feedId}-calendar.json`), JSON.stringify(data));
  return data;
}
