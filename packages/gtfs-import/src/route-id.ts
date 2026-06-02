import { pick } from "./csv.js";

/** GTFS route_id; synthesize from names if blank (some feeds). */
export function routeIdFromRow(row: Record<string, string>): string {
  const id = pick(row, "route_id");
  if (id) return id;
  const shortName = pick(row, "route_short_name");
  const longName = pick(row, "route_long_name");
  if (shortName || longName) {
    return `${shortName}::${longName}`.replace(/\s+/g, " ").trim();
  }
  return "";
}

export function routeKey(feedId: string, routeId: string): string {
  return `${feedId}:${routeId}`;
}
