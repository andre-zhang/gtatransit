import { getGroupedDemoStops } from "./demo-stop-groups";
import { ensureDemoAssets, loadDemoAssets } from "./demo-assets";

export { isDemoMode, useDemoFixtures } from "./demo-mode";
export { ensureDemoAssets } from "./demo-assets";

export type DemoStopMeta = {
  name: string;
  members: Array<{ feedId: string; stopId: string }>;
};

export async function ensureDemoCore() {
  await ensureDemoAssets();
  return getDemoCore();
}

export function getDemoCore() {
  const { core } = loadDemoAssets();
  return { ...core, stops: getGroupedDemoStops() };
}

/** @deprecated use ensureDemoCore */
export function getDemo() {
  return getDemoCore();
}
