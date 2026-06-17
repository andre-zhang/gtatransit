import { ensureDemoAssets } from "@/lib/demo-assets";
import { getDemoRouteDetail } from "@/lib/demo-route-detail";
import { ensureRtCacheWithin } from "@/lib/rt-cache";

export async function loadDemoRouteDetail(
  feedId: string,
  routeId: string,
  direction: number,
) {
  await ensureDemoAssets();
  await ensureRtCacheWithin(2000);
  return getDemoRouteDetail(feedId, routeId, direction);
}