import type { FeatureCollection } from "geojson";
import { loadDemoAssets } from "./demo-assets";
import type { DemoStopMeta } from "./demo";

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
  groupable: boolean;
  anchor: string | null;
};

/** Max distance to merge separate groupable stops (cross-agency OK). */
const STATION_CLUSTER_M = 50;

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
  const feed = loadDemoAssets().stopMeta[feedId] as Record<string, StopMeta> | undefined;
  return feed?.[stopId];
}

function normalizeAnchor(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

const PLATFORM_BAY_IN_NAME = /\b(?:platform|bay|track)\s+[a-z0-9]+\b/i;
const PLATFORM_BAY_SUFFIX =
  /\s*[-–—,]?\s*(?:platform|bay|track)\s+[a-z0-9]+(?:\s*[-–—,]\s*.*)?$/i;

/** Remove trailing platform / bay / track identifiers from stop names. */
export function stripPlatformBayFromName(name: string): string {
  let n = name.trim();
  let prev = "";
  while (prev !== n) {
    prev = n;
    n = n.replace(PLATFORM_BAY_SUFFIX, "").replace(/\s+/g, " ").trim();
  }
  return n || name.trim();
}

function platformBayAnchorFromName(name: string): string | null {
  if (!PLATFORM_BAY_IN_NAME.test(name)) return null;
  const base = stripPlatformBayFromName(name);
  if (!base || base === name.trim()) return null;
  return normalizeAnchor(base);
}

function isGoRailStationName(name: string): boolean {
  const n = name.trim();
  return /\bGO\s*$/i.test(n) || /\bGO\/UP\b/i.test(n) || /\bUP Express\b/i.test(n);
}

function stationAnchorFromName(name: string): string | null {
  const n = name.trim();
  const suffix = n.match(/\s-\s([^-]+?\sStation(?:\s.*)?)$/i);
  if (suffix) return normalizeAnchor(suffix[1]!);

  const direct = n.match(/^(.+?\sStation)(?:\s-\s.*)?$/i);
  if (direct && !/\bat\b/i.test(direct[1]!)) return normalizeAnchor(direct[1]!);

  return null;
}

function terminalAnchorFromName(name: string): string | null {
  const n = name.trim();
  if (/\bavenue\b/i.test(n) || /\bave\b/i.test(n)) return null;

  const terminal = n.match(/(.+?\b(?:Bus )?Terminal)\b/i);
  if (terminal) return normalizeAnchor(terminal[1]!);

  const exchange = n.match(/(.+?\bExchange)\b/i);
  if (exchange) return normalizeAnchor(exchange[1]!);

  return null;
}

function classifyStop(
  feedId: string,
  meta: StopMeta | undefined,
  name: string,
): { groupable: boolean; anchor: string | null } {
  const n = name.trim();

  if (feedId === "up" || /\bUP Express\b/i.test(n) || /\bGO\/UP\b/i.test(n)) {
    const station = stationAnchorFromName(n) ?? terminalAnchorFromName(n) ?? n;
    return { groupable: true, anchor: normalizeAnchor(station) };
  }

  if (feedId === "go" && isGoRailStationName(n)) {
    return { groupable: true, anchor: normalizeAnchor(n) };
  }

  if (meta?.locationType === 1 && !meta.parentStation) {
    return { groupable: true, anchor: normalizeAnchor(n) };
  }

  const subwayOrLrt = stationAnchorFromName(n);
  if (subwayOrLrt) {
    return { groupable: true, anchor: subwayOrLrt };
  }

  const terminal = terminalAnchorFromName(n);
  if (terminal) {
    return { groupable: true, anchor: terminal };
  }

  const platformBay = platformBayAnchorFromName(n);
  if (platformBay) {
    return { groupable: true, anchor: platformBay };
  }

  if (/\bexchange\b/i.test(n)) {
    return { groupable: true, anchor: normalizeAnchor(n) };
  }

  return { groupable: false, anchor: null };
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
  const { core, stopsGeo } = loadDemoAssets();
  const registry = core.stops as Record<string, DemoStopMeta>;
  const fc = stopsGeo;
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
    const { groupable, anchor } = classifyStop(member.feedId, meta, stop.name);
    points.push({
      groupId,
      feedId: member.feedId,
      stopId: member.stopId,
      name: stop.name,
      lat: meta?.lat ?? coords[1],
      lon: meta?.lon ?? coords[0],
      locationType: meta?.locationType ?? 0,
      parentStation: meta?.parentStation ?? null,
      groupable,
      anchor,
    });
  }
  return points;
}

/** Members for Toronto Union departure board only — not used to remove map pins. */
function unionScheduleMembers(): Array<{ feedId: string; stopId: string }> {
  const members = new Map<string, { feedId: string; stopId: string }>();
  members.set("go:UN", { feedId: "go", stopId: "UN" });
  members.set("up:UN", { feedId: "up", stopId: "UN" });
  for (const row of loadDemoAssets().unionSchedule) {
    members.set(`${row.feedId}:${row.stopId}`, { feedId: row.feedId, stopId: row.stopId });
  }
  return [...members.values()];
}

function clusterGroupIds(points: StopPoint[]): Map<string, string> {
  const uf = new UnionFind();
  for (const p of points) uf.find(p.groupId);

  const byAnchor = new Map<string, StopPoint[]>();
  for (const p of points) {
    if (!p.groupable || !p.anchor) continue;
    const key = `${p.feedId}:${p.anchor.toLowerCase()}`;
    if (!byAnchor.has(key)) byAnchor.set(key, []);
    byAnchor.get(key)!.push(p);
  }
  for (const cluster of byAnchor.values()) {
    for (let i = 1; i < cluster.length; i++) {
      uf.union(cluster[0]!.groupId, cluster[i]!.groupId);
    }
  }

  for (const p of points) {
    if (!p.parentStation) continue;
    const parentKey = `${p.feedId}:${p.parentStation}`;
    const parent = points.find((q) => q.feedId === p.feedId && q.stopId === p.parentStation);
    if (parent) uf.union(p.groupId, parent.groupId);
    void parentKey;
  }

  const groupable = points.filter((p) => p.groupable);
  for (let i = 0; i < groupable.length; i++) {
    for (let j = i + 1; j < groupable.length; j++) {
      const a = groupable[i]!;
      const b = groupable[j]!;
      if (uf.find(a.groupId) === uf.find(b.groupId)) continue;

      const dist = haversineM(a.lat, a.lon, b.lat, b.lon);
      if (dist > STATION_CLUSTER_M) continue;

      if (
        a.parentStation &&
        b.parentStation &&
        a.feedId === b.feedId &&
        a.parentStation === b.parentStation
      ) {
        uf.union(a.groupId, b.groupId);
        continue;
      }
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
        (p.groupable ? 100 : 0) +
        (p.feedId === "go" || p.feedId === "up" ? 50 : 0) +
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

function pickClusterDisplayName(members: StopPoint[], fallback: string): string {
  if (
    members.some(
      (m) =>
        m.stopId === "UN" ||
        m.name.toLowerCase().includes("union station") ||
        m.name.toLowerCase().includes("toronto union"),
    )
  ) {
    return "Toronto Union";
  }

  const counts = new Map<string, number>();
  for (const m of members) {
    const stripped = stripPlatformBayFromName(m.name);
    counts.set(stripped, (counts.get(stripped) ?? 0) + 1);
  }

  let best = stripPlatformBayFromName(fallback);
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && name.length < best.length)
    ) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function buildGroupedStops(): {
  grouped: Record<string, DemoStopMeta>;
  coords: Map<string, [number, number]>;
  alias: Map<string, string>;
  points: StopPoint[];
} {
  const registry = { ...(loadDemoAssets().core.stops as Record<string, DemoStopMeta>) };
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
    const rawName = names.get(target) ?? target;
    const displayName =
      cluster.length > 1
        ? pickClusterDisplayName(cluster, rawName)
        : stripPlatformBayFromName(rawName);
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

export function resolveStopGroupForMember(
  feedId: string,
  stopId: string,
): string | null {
  ensureCache();
  return (
    legacyAlias.get(`${feedId}:${stopId}`) ??
    legacyAlias.get(`${feedId}-${stopId}`) ??
    null
  );
}

function ensureCache() {
  if (cachedStops) return;

  const { grouped, coords, alias, points } = buildGroupedStops();
  cachedStops = grouped;

  const rawStopAliases = new Map<string, string | null>();
  for (const [gid, stop] of Object.entries(cachedStops)) {
    for (const m of stop.members) {
      legacyAlias.set(`${m.feedId}-${m.stopId}`, gid);
      legacyAlias.set(`${m.feedId}:${m.stopId}`, gid);
      legacyAlias.set(`go-${m.stopId}`, gid);
      legacyAlias.set(`up-${m.stopId}`, gid);
      legacyAlias.set(`ttc-${m.stopId}`, gid);
      legacyAlias.set(`miway-${m.stopId}`, gid);
      const existing = rawStopAliases.get(m.stopId);
      rawStopAliases.set(
        m.stopId,
        rawStopAliases.has(m.stopId) && existing !== gid ? null : gid,
      );
    }
  }
  for (const [stopId, gid] of rawStopAliases) {
    if (gid) legacyAlias.set(stopId, gid);
  }
  legacyAlias.set("demo-union", TORONTO_UNION_ID);
  legacyAlias.set("go-UN", TORONTO_UNION_ID);
  legacyAlias.set("up-UN", TORONTO_UNION_ID);
  legacyAlias.set("UN", TORONTO_UNION_ID);

  const unionMemberKeys = new Set(
    (cachedStops[TORONTO_UNION_ID]?.members ?? []).map(
      (m) => `${m.feedId}:${m.stopId}`,
    ),
  );

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

    const soleMember = stop.members.length === 1 ? stop.members[0] : null;
    if (
      soleMember &&
      unionMemberKeys.has(`${soleMember.feedId}:${soleMember.stopId}`)
    ) {
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

/** Bust cached grouping after demo fixture updates in dev. */
export function resetStopGroupCache() {
  cachedStops = null;
  cachedGeo = null;
  legacyAlias.clear();
}