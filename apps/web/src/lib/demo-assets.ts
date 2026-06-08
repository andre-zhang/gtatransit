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

let cache: {
  core: DemoCoreFile;
  stopsGeo: FeatureCollection;
  stopMeta: Record<string, Record<string, unknown>>;
  unionSchedule: ScheduleRow[];
  routesGeo: FeatureCollection;
} | null = null;

let loading: Promise<void> | null = null;

export async function ensureDemoAssets(): Promise<void> {
  if (cache) return;
  if (loading) return loading;

  loading = (async () => {
    // Sequential loads avoid EMFILE on serverless when combined with GTFS-RT polling.
    const core = await readDemoJsonFile<DemoCoreFile>("fixtures.json");
    const stopsGeo = await readDemoJsonFile<FeatureCollection>("stops.json");
    const stopMeta = await readDemoJsonFile<Record<string, Record<string, unknown>>>(
      "stop-meta.json",
    );
    const unionSchedule = await readDemoJsonFile<ScheduleRow[]>("union-schedule.json");
    const routesGeo = await readDemoJsonFile<FeatureCollection>("routes.json");
    cache = { core, stopsGeo, stopMeta, unionSchedule, routesGeo };
  })();

  return loading;
}

export function loadDemoAssets() {
  if (!cache) {
    throw new Error("Demo assets not loaded — call ensureDemoAssets() first");
  }
  return cache;
}
