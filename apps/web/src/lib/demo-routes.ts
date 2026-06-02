import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeatureCollection } from "geojson";

let cached: FeatureCollection | null = null;

export function getDemoRoutesGeoJson(): FeatureCollection {
  if (!cached) {
    const path = join(process.cwd(), "demo", "routes.json");
    cached = JSON.parse(readFileSync(path, "utf8")) as FeatureCollection;
  }
  return cached;
}
