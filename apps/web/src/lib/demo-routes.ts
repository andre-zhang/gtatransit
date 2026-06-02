import type { FeatureCollection } from "geojson";
import routes from "../../demo/routes.json";

export function getDemoRoutesGeoJson(): FeatureCollection {
  return routes as FeatureCollection;
}
