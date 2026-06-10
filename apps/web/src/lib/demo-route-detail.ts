import type { LineString } from "geojson";
import { ensureDemoAssets, loadDemoAssets } from "./demo-assets";
import { routeColor } from "./colors";
import { loadRouteScheduleRows, loadUnionSchedule } from "./demo-schedule-data";
import type { ScheduleRow } from "./demo-schedules";
import { enrichHeadsign, needsHeadsignLookup, tripHeadsign } from "./demo-trip-headsign";
import { routesMatch } from "./route-match";
import { getRtVehicles, getTripRt } from "./rt-cache";

type RouteMeta = {
  short_name: string | null;
  long_name: string | null;
  route_type: number;
  color: string;
};

function formatDeparture(time: string): string {
  const parts = time.split(":");
  if (parts.length < 2) return time;
  const h = Number(parts[0]);
  const m = parts[1];
  if (Number.isNaN(h)) return time.slice(0, 5);
  return `${String(h % 24).padStart(2, "0")}:${m}`;
}

function findRouteMeta(feedId: string, routeId: string): RouteMeta | null {
  const { core } = loadDemoAssets();
  for (const agency of core.filterTree.agencies) {
    if (agency.id !== feedId) continue;
    for (const mode of agency.modes) {
      const r = mode.routes.find(
        (x) => x.id === routeId || x.shortName === routeId,
      );
      if (r) {
        return {
          short_name: r.shortName,
          long_name: r.longName,
          route_type: mode.type,
          color: routeColor(feedId, r.shortName, null),
        };
      }
    }
  }
  return null;
}

async function collectScheduleRows(
  feedId: string,
  routeId: string,
): Promise<ScheduleRow[]> {
  const rows: ScheduleRow[] = [];
  const matches = (row: ScheduleRow) =>
    row.routeId === routeId || row.routeShort === routeId;

  if (feedId === "go" || feedId === "ttc" || feedId === "miway") {
    return loadRouteScheduleRows(feedId, routeId);
  }

  const union = await loadUnionSchedule();
  for (const row of union) {
    if (row.feedId === feedId && matches(row)) rows.push(row);
  }
  return rows;
}

function routeMatchesId(
  feedId: string,
  routeId: string,
  meta: RouteMeta,
  props: Record<string, unknown>,
): boolean {
  if (props.feedId !== feedId) return false;
  const rid = String(props.routeId ?? "");
  const rshort = String(props.routeShort ?? "");
  return (
    rid === routeId ||
    rshort === routeId ||
    rid === meta.short_name ||
    rshort === meta.short_name
  );
}

function predominantHeadsigns(rows: ScheduleRow[]): [string, string] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const h = row.headsign?.trim();
    if (!h) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  return [sorted[0] ?? "Outbound", sorted[1] ?? sorted[0] ?? "Inbound"];
}

function filterRowsByDirection(
  rows: ScheduleRow[],
  direction: number,
): ScheduleRow[] {
  const [a, b] = predominantHeadsigns(rows);
  const target = direction === 0 ? a : b;
  const filtered = rows.filter((row) => row.headsign === target);
  return filtered.length ? filtered : rows;
}

function findRouteShape(
  feedId: string,
  routeId: string,
  direction: number,
  meta: RouteMeta,
): LineString | null {
  const fc = loadDemoAssets().routesGeo;
  const hit = fc.features.find((f) => {
    const p = f.properties as Record<string, unknown> | null;
    if (!p || !routeMatchesId(feedId, routeId, meta, p)) return false;
    return Number(p.directionId ?? 0) === direction;
  });
  if (!hit?.geometry || hit.geometry.type !== "LineString") return null;
  return hit.geometry as LineString;
}

export async function getDemoRouteDetail(
  feedId: string,
  routeId: string,
  direction: number,
) {
  await ensureDemoAssets();

  let meta = findRouteMeta(feedId, routeId);
  if (!meta) {
    const union = await loadUnionSchedule();
    const sample = union.find(
      (row) =>
        row.feedId === feedId &&
        (row.routeId === routeId || row.routeShort === routeId),
    );
    if (sample) {
      meta = {
        short_name: sample.routeShort,
        long_name: sample.headsign,
        route_type: feedId === "go" ? 2 : 3,
        color: sample.routeColor,
      };
    }
  }
  if (!meta) return null;

  const tripMap = new Map<
    string,
    { trip_id: string; headsign: string | null; first_departure: string }
  >();

  const allRows = await collectScheduleRows(feedId, routeId);
  const directionLabels = predominantHeadsigns(allRows);

  for (const row of filterRowsByDirection(allRows, direction)) {
    const dep = formatDeparture(row.departureTime);
    const existing = tripMap.get(row.tripId);
    if (!existing || dep < existing.first_departure) {
      tripMap.set(row.tripId, {
        trip_id: row.tripId,
        headsign: row.headsign,
        first_departure: dep,
      });
    }
  }

  const trips = [...tripMap.values()]
    .sort((a, b) => a.first_departure.localeCompare(b.first_departure))
    .slice(0, 200);

  const liveVehicles = getRtVehicles().filter(
    (v) =>
      v.feedId === feedId &&
      routesMatch(feedId, routeId, meta.short_name, v.routeId),
  );

  const vehicles = (
    await Promise.all(
      liveVehicles.slice(0, 80).map(async (v) => {
        let headsign: string | null = null;
        if (v.tripId) {
          headsign = await tripHeadsign(feedId, v.tripId);
          if (
            headsign &&
            directionLabels[direction] &&
            headsign !== directionLabels[direction]
          ) {
            return null;
          }
        }
        return {
          vehicle_id: v.vehicleId,
          label: v.label?.trim() || v.vehicleId,
          lat: v.lat!,
          lon: v.lon!,
          headsign,
          delay_sec:
            v.delaySec ??
            (v.tripId ? (getTripRt(feedId, v.tripId)?.delaySec ?? null) : null),
        };
      }),
    )
  ).filter((v): v is NonNullable<typeof v> => v != null);

  const tripsWithHeadsigns = await enrichHeadsign(
    feedId,
    trips.map((t) => ({
      ...t,
      headsign:
        t.headsign?.trim() && !needsHeadsignLookup(t.headsign)
          ? t.headsign.trim()
          : null,
    })),
  );

  return {
    route: meta,
    direction,
    directionLabels,
    trips: tripsWithHeadsigns,
    vehicles,
    shape: findRouteShape(feedId, routeId, direction, meta),
  };
}
