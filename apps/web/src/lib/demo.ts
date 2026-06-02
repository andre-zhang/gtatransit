import core from "../../demo/fixtures.json";
import { getGroupedDemoStops } from "./demo-stop-groups";

export function isDemoMode() {
  return process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true";
}

export type DemoStopMeta = {
  name: string;
  members: Array<{ feedId: string; stopId: string }>;
};

export function getDemoCore() {
  const base = core as typeof core & {
    stops: Record<string, DemoStopMeta>;
  };
  if (isDemoMode()) {
    return { ...base, stops: getGroupedDemoStops() };
  }
  return base;
}

/** @deprecated use getDemoCore + specific loaders */
export function getDemo() {
  return getDemoCore();
}
