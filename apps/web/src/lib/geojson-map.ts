import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import {
  decimateLine,
  lineTouchesBbox,
  maxPointsForZoom,
  parseBbox,
  pointInBbox,
  type Bbox,
} from "./map-zoom";
import { dedupeRouteFeatures } from "./route-shape-dedupe";

function isRailFeature(props: Record<string, unknown>): boolean {
  const routeType = Number(props.routeType ?? 3);
  return routeType === 2 || routeType === 1;
}

type RouteFeature = Feature<LineString, Record<string, unknown>>;
type PointFeature = Feature<Point, Record<string, unknown>>;

export function filterRouteCollection(
  fc: FeatureCollection,
  bbox: Bbox | null,
  zoom: number,
): FeatureCollection<LineString> {
  const features: RouteFeature[] = [];

  for (const f of fc.features) {
    if (f.geometry?.type !== "LineString") continue;
    const props = f.properties ?? {};
    const coords = f.geometry.coordinates as number[][];
    if (bbox && !lineTouchesBbox(coords, bbox)) continue;

    const rail = isRailFeature(props);
    const maxPts = rail ? 8000 : maxPointsForZoom(zoom);
    const simplified =
      rail || zoom >= 15 ? coords : decimateLine(coords, maxPts);

    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: simplified },
      properties: f.properties ?? {},
    });
  }

  return { type: "FeatureCollection", features: dedupeRouteFeatures(features) };
}

export function filterPointCollection(
  fc: FeatureCollection,
  bbox: Bbox | null,
): FeatureCollection<Point> {
  const features: PointFeature[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates;
    if (bbox && !pointInBbox(lon, lat, bbox, 0.005)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: f.properties ?? {},
    });
  }
  return { type: "FeatureCollection", features };
}

export function mapQueryParams(searchParams: URLSearchParams) {
  const zoom = Math.min(22, Math.max(0, Number(searchParams.get("zoom") ?? 10)));
  const bbox = parseBbox(searchParams.get("bbox"));
  return { zoom, bbox };
}
