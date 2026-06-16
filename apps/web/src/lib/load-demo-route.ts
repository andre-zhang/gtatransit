import { ensureDemoAssets } from "@/lib/demo-assets";
import { getDemoRouteDetail } from "@/lib/demo-route-detail";
import { ensureRtCache } from "@/lib/rt-cache";

export async function loadDemoRouteDetail(
  feedId: string,
  routeId: string,
  direction: number,
) {
  await ensureDemoAssets();
  await ensureRtCache();
  return getDemoRouteDetail(feedId, routeId, direction);
}
