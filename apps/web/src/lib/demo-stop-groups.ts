import type { FeatureCollection } from "geojson";
import stopMeta from "../../demo/stop-meta.json";
import unionSchedule from "../../demo/union-schedule.json";
import core from "../../demo/fixtures.json";
import stopsGeo from "../../demo/stops.json";
import type { DemoStopMeta } from "./demo";
import type { ScheduleRow } from "./demo-schedules";

type StopMeta = {
  locationType: number;
  parentStation: string | null;
  name: string;
  lat: number;
  lon: number;
};

type StopPoint = {
  groupId: string;
  feedId: string;
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  locationType: number;
  parentStation: string | null;
  isTerminal: boolean;
};

const TERMINAL_RADIUS_M = 25;

export const TORONTO_UNION_ID = "toronto-union";

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function metaFor(feedId: string, stopId: string): StopMeta | undefined {
  const feed = (stopMeta as Record<string, Record<string, StopMeta>>)[feedId];
  return feed?.[stopId];
}

function isTerminalLike(meta: StopMeta | undefined, name: string, stopId: string): boolean {
  if (meta?.locationType === 1) return true;
  if (meta?.parentStation) return false;
  if (stopId.length <= 3 && /^[A-Z0-9]+$/.test(stopId)) return true;
  const n = name.toLowerCase();
  return (
    n.includes("terminal") ||
    n.includes(" station") ||
    (n.endsWith(" go") && !n.includes("@"))
  );
}

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!));
    return this.parent.get(x)!;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function buildStopPoints(): StopPoint[] {
  const registry = core.stops as Record<string, DemoStopMeta>;
  const fc = stopsGeo as FeatureCollection;
  const coordByGroup = new Map<string, [number, number]>();
  for (const f of fc.features) {
    const gid = f.properties?.groupId as string | undefined;
    if (!gid || f.geometry?.type !== "Point") continue;
    coordByGroup.set(gid, f.geometry.coordinates as [number, number]);
  }

  const points: StopPoint[] = [];
  for (const [groupId, stop] of Object.entries(registry)) {
    if (groupId === "demo-union" || groupId === TORONTO_UNION_ID) continue;
    const member = stop.members[0];
    if (!member) continue;
    const coords = coordByGroup.get(groupId);
    if (!coords) continue;
    const meta = metaFor(member.feedId, member.stopId);
    points.push({
      groupId,
      feedId: member.feedId,
      stopId: member.stopId,
      name: stop.name,
      lat: meta?.lat ?? coords[1],
      lon: meta?.lon ?? coords[0],
      locationType: meta?.locationType ?? 0,
      parentStation: meta?.parentStation ?? null,
      isTerminal: isTerminalLike(meta, stop.name, member.stopId),
    });
  }
  return points;
}

/** Members for Toronto Union departure board only — not used to remove map pins. */
function unionScheduleMembers(): Array<{ feedId: string; stopId: string }> {
  const members = new Map<string, { feedId: string; stopId: string }>();
  members.set("go:UN", { feedId: "go", stopId: "UN" });
  for (const row of unionSchedule as ScheduleRow[]) {
    members.set(`${row.feedId}:${row.stopId}`, { feedId: row.feedId, stopId: row.stopId });
  }
  return [...members.values()];
}

function clusterGroupIds(points: StopPoint[]): Map<string, string> {
  const uf = new UnionFind();
  for (const p of points) uf.find(p.groupId);

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]!;
      const b = points[j]!;
      const dist = haversineM(a.lat, a.lon, b.lat, b.lon);

      if (
        a.parentStation &&
        b.parentStation &&
        a.feedId === b.feedId &&
        a.parentStation === b.parentStation
      ) {
        uf.union(a.groupId, b.groupId);
        continue;
      }
      if (a.feedId === b.feedId && a.parentStation === b.stopId) {
        uf.union(a.groupId, b.groupId);
        continue;
      }
      if (b.feedId === a.feedId && b.parentStation === a.stopId) {
        uf.union(a.groupId, b.groupId);
        continue;
      }

      const terminalCluster =
        a.isTerminal || b.isTerminal || a.locationType === 1 || b.locationType === 1;
      if (!terminalCluster || dist > TERMINAL_RADIUS_M) continue;
      uf.union(a.groupId, b.groupId);
    }
  }

  const byRoot = new Map<string, StopPoint[]>();
  for (const p of points) {
    const root = uf.find(p.groupId);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root)!.push(p);
  }

  const alias = new Map<string, string>();
  for (const [root, cluster] of byRoot) {
    if (cluster.length <= 1) {
      alias.set(root, root);
      continue;
    }
    cluster.sort((x, y) => {
      const score = (p: StopPoint) =>
        (p.locationType === 1 ? 1000 : 0) +
        (p.isTerminal ? 100 : 0) +
        (p.stopId.length <= 3 ? 10 : 0);
      return score(y) - score(x);
    });
    const primary = cluster[0]!.groupId;
    for (const p of cluster) alias.set(p.groupId, primary);
  }

  for (const p of points) {
    if (!alias.has(p.groupId)) alias.set(p.groupId, p.groupId);
  }
  return alias;
}

function terminalDisplayName(members: StopPoint[], fallback: string): string {
  if (members.some((m) => m.stopId === "UN" || m.name.toLowerCase().includes("union station"))) {
    return "Toronto Union";
  }
  return fallback;
}

function buildGroupedStops(): {
  grouped: Record<string, DemoStopMeta>;
  coords: Map<string, [number, number]>;
  alias: Map<string, string>;
  points: StopPoint[];
} {
  const registry = { ...(core.stops as Record<string, DemoStopMeta>) };
  delete registry["demo-union"];

  const points = buildStopPoints();
  const alias = clusterGroupIds(points);
  const grouped: Record<string, DemoStopMeta> = {};
  const memberLists = new Map<string, Array<{ feedId: string; stopId: string }>>();
  const names = new Map<string, string>();
  const coords = new Map<string, [number, number]>();
  const clusterPoints = new Map<string, StopPoint[]>();

  for (const p of points) {
    const target = alias.get(p.groupId) ?? p.groupId;
    if (!memberLists.has(target)) memberLists.set(target, []);
    if (!clusterPoints.has(target)) clusterPoints.set(target, []);
    clusterPoints.get(target)!.push(p);
    const stop = registry[p.groupId];
    if (stop) memberLists.get(target)!.push(...stop.members);
    if (!names.has(target)) names.set(target, stop?.name ?? p.name);
    if (!coords.has(target)) coords.set(target, [p.lon, p.lat]);
  }

  for (const [target, members] of memberLists) {
    const deduped = [...new Map(members.map((m) => [`${m.feedId}:${m.stopId}`, m])).values()];
    const cluster = clusterPoints.get(target) ?? [];
    const displayName =
      cluster.length > 1 ? terminalDisplayName(cluster, names.get(target) ?? target) : (names.get(target) ?? target);
    grouped[target] = { name: displayName, members: deduped };
  }

  grouped[TORONTO_UNION_ID] = {
    name: "Toronto Union",
    members: unionScheduleMembers(),
  };

  return { grouped, coords, alias, points };
}

let cachedStops: Record<string, DemoStopMeta> | null = null;
let cachedGeo: FeatureCollection | null = null;
const legacyAlias = new Map<string, string>();

export function resolveStopGroupId(groupId: string): string {
  ensureCache();
  if (cachedStops![groupId]) return groupId;
  return legacyAlias.get(groupId) ?? groupId;
}

function ensureCache() {
  if (cachedStops) return;

  const { grouped, coords, alias, points } = buildGroupedStops();
  cachedStops = grouped;

  for (const [gid, stop] of Object.entries(cachedStops)) {
    for (const m of stop.members) {
      legacyAlias.set(`${m.feedId}-${m.stopId}`, gid);
      legacyAlias.set(`${m.feedId}:${m.stopId}`, gid);
      legacyAlias.set(`go-${m.stopId}`, gid);
      legacyAlias.set(`ttc-${m.stopId}`, gid);
      legacyAlias.set(`miway-${m.stopId}`, gid);
    }
  }
  legacyAlias.set("demo-union", TORONTO_UNION_ID);
  legacyAlias.set("go-UN", TORONTO_UNION_ID);

  const features: FeatureCollection["features"] = [];
  for (const [gid, stop] of Object.entries(cachedStops)) {
    if (gid === TORONTO_UNION_ID) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [-79.3806, 43.6453] },
        properties: { groupId: gid, name: stop.name, feedId: "go" },
      });
      continue;
    }
    let lonLat = coords.get(gid);
    if (!lonLat) {
      const pt = points.find((p) => alias.get(p.groupId) === gid || p.groupId === gid);
      if (pt) lonLat = [pt.lon, pt.lat];
    }
    if (!lonLat) continue;
    const member = stop.members[0];
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: lonLat },
      properties: {
        groupId: gid,
        name: stop.name,
        feedId: member?.feedId ?? "go",
      },
    });
  }

  cachedGeo = { type: "FeatureCollection", features };
}

export function getGroupedDemoStops(): Record<string, DemoStopMeta> {
  ensureCache();
  return cachedStops!;
}

export function getGroupedDemoStopsGeoJson(): FeatureCollection {
  ensureCache();
  return cachedGeo!;
}
