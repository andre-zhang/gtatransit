import { getGroupedDemoStops } from "./demo-stop-groups";
import { loadDemoAssets } from "./demo-assets";

export { isDemoMode, useDemoFixtures } from "./demo-mode";

export type DemoStopMeta = {
  name: string;
  members: Array<{ feedId: string; stopId: string }>;
};

export function getDemoCore() {
  const { core } = loadDemoAssets();
  return { ...core, stops: getGroupedDemoStops() };
}

/** @deprecated use getDemoCore + specific loaders */
export function getDemo() {
  return getDemoCore();
}
