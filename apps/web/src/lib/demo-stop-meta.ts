import { readDemoJsonFile } from "./demo-read";
import type { DemoStopMeta } from "./demo";
import { resolveStopGroupId } from "./demo-stop-groups";

/** Load one stop group from fixtures.json only (no full demo asset bundle). */
export async function loadDemoStopMeta(groupId: string): Promise<DemoStopMeta | null> {
  const core = await readDemoJsonFile<{ stops: Record<string, DemoStopMeta> }>("fixtures.json");
  const resolved = resolveStopGroupId(groupId);
  return core.stops[resolved] ?? null;
}
