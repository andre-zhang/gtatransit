import type { FeatureCollection } from "geojson";
import { parseDirs, parseList } from "./parse-filters";
import { routesMatch } from "./route-match";

export type MapFilters = {
  agencies: string[];
  modes: string[];
  routes: string[];
  directions: number[];
  stopDirections: number[];
};

export function parseMapFilters(searchParams: URLSearchParams): MapFilters {
  return {
    agencies: parseList(searchParams.get("agencies")),
    modes: parseList(searchParams.get("modes")),
    routes: parseList(searchParams.get("routes")),
    directions: parseDirs(searchParams.get("directions")),
    stopDirections: parseDirs(searchParams.get("stopDirections")),
  };
}

function routeKeys(feedId: string, routeId: string, routeShort?: string | null): string[] {
  const keys = [`${feedId}:${routeId}`];
  if (routeShort) keys.push(`${feedId}:${routeShort}`);
  return keys;
}

export function routeMatchesFilters(
  props: Record<string, unknown>,
  filters: MapFilters,
): boolean {
  const feedId = String(props.feedId ?? "");
  const routeId = String(props.routeId ?? "");
  const routeShort = props.routeShort as string | undefined;
  const routeType = Number(props.routeType ?? 3);
  const directionId = Number(props.directionId ?? 0);

  if (filters.agencies.length && !filters.agencies.includes(feedId)) return false;
  if (filters.modes.length && !filters.modes.includes(`${feedId}:${routeType}`)) return false;
  if (filters.routes.length) {
    const keys = routeKeys(feedId, routeId, routeShort);
    if (!keys.some((k) => filters.routes.includes(k))) return false;
  }
  if (filters.directions.length && !filters.directions.includes(directionId)) return false;
  return true;
}

export function filterDemoRoutes(
  fc: FeatureCollection,
  filters: MapFilters,
): FeatureCollection {
  const features = fc.features.filter((f) => routeMatchesFilters(f.properties ?? {}, filters));
  return { type: "FeatureCollection", features };
}

export function stopMatchesFilters(
  props: Record<string, unknown>,
  filters: MapFilters,
): boolean {
  const feedId = String(props.feedId ?? "");
  if (filters.agencies.length && !filters.agencies.includes(feedId)) return false;
  return true;
}

export function filterDemoStops(
  fc: FeatureCollection,
  filters: MapFilters,
): FeatureCollection {
  const features = fc.features.filter((f) => stopMatchesFilters(f.properties ?? {}, filters));
  return { type: "FeatureCollection", features };
}

export function vehicleMatchesFilters(
  v: { feedId: string; routeId?: string },
  filters: MapFilters,
): boolean {
  if (filters.agencies.length && !filters.agencies.includes(v.feedId)) return false;
  if (filters.routes.length && v.routeId) {
    for (const filterRoute of filters.routes) {
      const colon = filterRoute.indexOf(":");
      if (colon < 0) continue;
      const feedId = filterRoute.slice(0, colon);
      const pageRouteId = filterRoute.slice(colon + 1);
      if (feedId !== v.feedId) continue;
      if (routesMatch(v.feedId, pageRouteId, null, v.routeId)) return true;
    }
    return false;
  }
  return true;
}
