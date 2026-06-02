import type { FeatureCollection } from "geojson";
import { getGroupedDemoStopsGeoJson } from "./demo-stop-groups";

export function getDemoStopsGeoJson(): FeatureCollection {
  return getGroupedDemoStopsGeoJson();
}
