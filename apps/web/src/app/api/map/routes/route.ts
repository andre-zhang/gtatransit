import { NextRequest, NextResponse } from "next/server";
import { getDemoRoutesGeoJson } from "@/lib/demo-routes";
import { isDemoMode } from "@/lib/demo";
import { filterDemoRoutes, parseMapFilters } from "@/lib/demo-map-filters";
import { filterRouteCollection, mapQueryParams } from "@/lib/geojson-map";
import { ZOOM_ROUTES } from "@/lib/map-zoom";

const cache = new Map<string, { body: string; at: number }>();
const CACHE_MS = 5000;

export async function GET(req: NextRequest) {
  const { zoom, bbox } = mapQueryParams(req.nextUrl.searchParams);

  if (zoom < ZOOM_ROUTES) {
    return NextResponse.json({ type: "FeatureCollection", features: [] });
  }

  if (isDemoMode()) {
    const filters = parseMapFilters(req.nextUrl.searchParams);
    const key = `${bbox?.join(",") ?? "all"}:${zoom}:${JSON.stringify(filters)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return new NextResponse(hit.body, {
        headers: { "Content-Type": "application/json" },
      });
    }
    const filtered = filterRouteCollection(
      filterDemoRoutes(getDemoRoutesGeoJson(), filters),
      bbox,
      zoom,
    );
    const body = JSON.stringify(filtered);
    cache.set(key, { body, at: Date.now() });
    return new NextResponse(body, { headers: { "Content-Type": "application/json" } });
  }

  const { default: liveHandler } = await import("./live");
  return liveHandler(req);
}
