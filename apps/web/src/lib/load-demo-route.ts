import { ensureDemoAssets } from "@/lib/demo-assets";
import { getDemoRouteDetail } from "@/lib/demo-route-detail";
import { refreshRtCache } from "@/lib/rt-cache";

export async function loadDemoRouteDetail(
  feedId: string,
  routeId: string,
  direction: number,
) {
  await refreshRtCache();
  await ensureDemoAssets();
  return getDemoRouteDetail(feedId, routeId, direction);
}
