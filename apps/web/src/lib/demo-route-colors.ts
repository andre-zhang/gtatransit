import { getDemoRoutesGeoJson } from "./demo-routes";
import { routeTail } from "./route-match";

let byFeedShort = new Map<string, string>();
let loaded = false;

function ensureRouteColorIndex() {
  if (loaded) return;
  loaded = true;
  try {
    const fc = getDemoRoutesGeoJson();
    for (const f of fc.features) {
      const feedId = f.properties?.feedId as string | undefined;
      const short = f.properties?.routeShort as string | undefined;
      const color = f.properties?.color as string | undefined;
      if (!feedId || !short || !color) continue;
      const key = `${feedId}:${short}`;
      if (!byFeedShort.has(key)) byFeedShort.set(key, color);
    }
  } catch {
    /* demo assets not warm yet — rail/agency fallbacks still apply */
  }
}

export function lookupDemoRouteColor(
  feedId: string,
  routeShort: string | null | undefined,
  routeId?: string | null,
): string | undefined {
  ensureRouteColorIndex();
  if (routeShort) {
    const hit = byFeedShort.get(`${feedId}:${routeShort}`);
    if (hit) return hit;
  }
  if (routeId) {
    const tail = routeTail(routeId);
    return byFeedShort.get(`${feedId}:${tail}`);
  }
  return undefined;
}
