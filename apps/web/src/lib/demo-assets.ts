import type { FeatureCollection } from "geojson";
import type { DemoStopMeta } from "./demo";
import { readDemoJsonFile } from "./demo-read";
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

type DemoCache = {
  core: DemoCoreFile;
  stopsGeo: FeatureCollection;
  stopMeta: Record<string, Record<string, unknown>>;
  unionSchedule: ScheduleRow[];
  routesGeo?: FeatureCollection;
};

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

let cache: DemoCache | null = null;
let stopLoading: Promise<void> | null = null;
let routesLoading: Promise<void> | null = null;

/** Stop board + grouping only — skips heavy routes.json. */
export async function ensureDemoStopAssets(): Promise<void> {
  if (cache) return;
  if (stopLoading) return stopLoading;

  stopLoading = (async () => {
    const [core, stopsGeo, stopMeta, unionSchedule] = await Promise.all([
      readDemoJsonFile<DemoCoreFile>("fixtures.json"),
      readDemoJsonFile<FeatureCollection>("stops.json"),
      readDemoJsonFile<Record<string, Record<string, unknown>>>("stop-meta.json"),
      readDemoJsonFile<ScheduleRow[]>("union-schedule.json"),
    ]);
    cache = { core, stopsGeo, stopMeta, unionSchedule };
  })();

  return stopLoading;
}

export async function ensureDemoAssets(): Promise<void> {
  await ensureDemoStopAssets();
  if (cache?.routesGeo) return;
  if (routesLoading) return routesLoading;

  routesLoading = (async () => {
    const routesGeo = await readDemoJsonFile<FeatureCollection>("routes.json");
    cache = { ...cache!, routesGeo };
  })();

  return routesLoading;
}

export function loadDemoAssets() {
  if (!cache) {
    throw new Error("Demo assets not loaded — call ensureDemoStopAssets() first");
  }
  return {
    core: cache.core,
    stopsGeo: cache.stopsGeo,
    stopMeta: cache.stopMeta,
    unionSchedule: cache.unionSchedule,
    routesGeo: cache.routesGeo ?? EMPTY_FC,
  };
}
