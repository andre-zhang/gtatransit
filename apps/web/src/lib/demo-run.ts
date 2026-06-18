import { getGroupedDemoStops, resolveStopGroupId } from "./demo-stop-groups";
import { getDemoRun, getDemoServiceView } from "./demo-service-view";

export { getDemoRun, getDemoServiceView };
export type { ServiceViewData, ServiceStop } from "./demo-service-view";

export function resolveDemoStop(groupId: string) {
  const id = resolveStopGroupId(groupId);
  return getGroupedDemoStops()[id];
}
