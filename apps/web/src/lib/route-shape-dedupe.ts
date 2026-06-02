import type { Feature, LineString } from "geojson";

type RouteFeature = Feature<LineString, Record<string, unknown>>;

function lineLengthKm(coords: number[][]): number {
  let len = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon0, lat0] = coords[i - 1]!;
    const [lon1, lat1] = coords[i]!;
    const dLon = ((lon1 - lon0) * Math.PI) / 180;
    const latMid = (((lat0 + lat1) / 2) * Math.PI) / 180;
    const dLat = ((lat1 - lat0) * Math.PI) / 180;
    len += Math.hypot(dLon * Math.cos(latMid), dLat) * 6371;
  }
  return len;
}

function routeMapKey(f: RouteFeature): string | null {
  const feedId = String(f.properties?.feedId ?? "");
  const routeId = String(f.properties?.routeId ?? "");
  if (!feedId || !routeId) return null;
  const short = f.properties?.routeShort;
  if (typeof short === "string" && short.length > 0) return `${feedId}:${short}`;
  const versioned = routeId.match(/^\d+-(.+)$/);
  if (versioned) return `${feedId}:${versioned[1]}`;
  return `${feedId}:${routeId}`;
}

/** One map line per route — GTFS often has separate shapes per direction on parallel tracks. */
export function dedupeRouteFeatures(features: RouteFeature[]): RouteFeature[] {
  const groups = new Map<string, RouteFeature[]>();

  for (const f of features) {
    const key = routeMapKey(f);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  const out: RouteFeature[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]!);
      continue;
    }
    const ranked = [...list].sort((a, b) => {
      const la = lineLengthKm(a.geometry.coordinates as number[][]);
      const lb = lineLengthKm(b.geometry.coordinates as number[][]);
      return lb - la;
    });
    const best = ranked[0]!;
    out.push({
      ...best,
      properties: {
        ...best.properties,
        directionId: best.properties?.directionId ?? 0,
        mapShape: "canonical",
      },
    });
  }
  return out;
}
