import core from "../../demo/fixtures.json";
import { getGroupedDemoStops } from "./demo-stop-groups";

export { isDemoMode, useDemoFixtures } from "./demo-mode";

export type DemoStopMeta = {
  name: string;
  members: Array<{ feedId: string; stopId: string }>;
};

export function getDemoCore() {
  const base = core as typeof core & {
    stops: Record<string, DemoStopMeta>;
  };
  return { ...base, stops: getGroupedDemoStops() };
}

/** @deprecated use getDemoCore + specific loaders */
export function getDemo() {
  return getDemoCore();
}
