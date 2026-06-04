import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeatureCollection } from "geojson";
import { resolveDemoDir } from "./demo-dir";
import type { DemoStopMeta } from "./demo";
import type { ScheduleRow } from "./demo-schedule-types";
import type { FilterTree } from "./types";

type DemoCoreFile = {
  rtUpdated: string;
  filterTree: FilterTree;
  vehiclesGeoJson: FeatureCollection;
  stops: Record<string, DemoStopMeta>;
  runs: Record<string, unknown>;
  routes: Record<string, unknown>;
};

let cache: {
  core: DemoCoreFile;
  stopsGeo: FeatureCollection;
  stopMeta: Record<string, Record<string, unknown>>;
  unionSchedule: ScheduleRow[];
  routesGeo: FeatureCollection;
} | null = null;

function readJson<T>(name: string): T {
  const path = join(resolveDemoDir(), name);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadDemoAssets() {
  if (cache) return cache;
  cache = {
    core: readJson<DemoCoreFile>("fixtures.json"),
    stopsGeo: readJson<FeatureCollection>("stops.json"),
    stopMeta: readJson("stop-meta.json"),
    unionSchedule: readJson<ScheduleRow[]>("union-schedule.json"),
    routesGeo: readJson<FeatureCollection>("routes.json"),
  };
  return cache;
}
