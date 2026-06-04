import type { FeatureCollection } from "geojson";
import { loadDemoAssets } from "./demo-assets";

export function getDemoRoutesGeoJson(): FeatureCollection {
  return loadDemoAssets().routesGeo;
}
