import type { DemoStopMeta } from "./demo";
import { ensureDemoAssets } from "./demo-assets";
import { getGroupedDemoStops, resolveStopGroupId } from "./demo-stop-groups";

/** Load grouped stop meta (merged members, cleaned display name). */
export async function loadDemoStopMeta(groupId: string): Promise<DemoStopMeta | null> {
  await ensureDemoAssets();
  const resolved = resolveStopGroupId(groupId);
  return getGroupedDemoStops()[resolved] ?? null;
}
