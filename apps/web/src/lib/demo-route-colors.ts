import { routeTail } from "./route-match";
import routeColorIndex from "./route-color-index.json";

const byFeedShort = new Map<string, string>(Object.entries(routeColorIndex));

export function lookupDemoRouteColor(
  feedId: string,
  routeShort: string | null | undefined,
  routeId?: string | null,
): string | undefined {
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
