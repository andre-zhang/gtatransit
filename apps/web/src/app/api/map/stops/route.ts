import type { FeatureCollection } from "geojson";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getDemoStopsGeoJson } from "@/lib/demo-stops-geo";
import { useDemoFixtures } from "@/lib/demo-mode";
import { filterDemoStops, parseMapFilters } from "@/lib/demo-map-filters";
import { filterPointCollection, mapQueryParams } from "@/lib/geojson-map";
import { ZOOM_STOPS } from "@/lib/map-zoom";
import { parseDirs, parseList } from "@/lib/parse-filters";

export { dynamic, maxDuration } from "@/lib/api-config";

const cache = new Map<string, { body: string; at: number }>();
const CACHE_MS = 5000;

export async function GET(req: NextRequest) {
  const { bbox } = mapQueryParams(req.nextUrl.searchParams);
  const zoom = Number(req.nextUrl.searchParams.get("zoom") ?? 0);

  if (zoom < ZOOM_STOPS) {
    return NextResponse.json({ type: "FeatureCollection", features: [] });
  }

  if (await useDemoFixtures()) {
    const { ensureDemoAssets } = await import("@/lib/demo-assets");
    await ensureDemoAssets();
    const filters = parseMapFilters(req.nextUrl.searchParams);
    const key = `${bbox?.join(",") ?? "all"}:${zoom}:${JSON.stringify(filters)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return new NextResponse(hit.body, {
        headers: { "Content-Type": "application/json" },
      });
    }
    const filtered = filterPointCollection(
      filterDemoStops(getDemoStopsGeoJson(), filters),
      bbox,
    );
    const body = JSON.stringify(filtered);
    cache.set(key, { body, at: Date.now() });
    return new NextResponse(body, { headers: { "Content-Type": "application/json" } });
  }

  const agencies = parseList(req.nextUrl.searchParams.get("agencies"));
  const dirs = parseDirs(req.nextUrl.searchParams.get("stopDirections"));

  const db = getSql();

  const groups = bbox
    ? await db<
        Array<{ id: string; name: string; lat: number; lon: number; bearing: number | null }>
      >`
        SELECT id, name, lat, lon, bearing
        FROM stop_groups
        WHERE geom && ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326)
      `
    : await db<
        Array<{ id: string; name: string; lat: number; lon: number; bearing: number | null }>
      >`SELECT id, name, lat, lon, bearing FROM stop_groups`;

  const members = await db<
    Array<{ group_id: string; feed_id: string; stop_id: string; direction_id: number | null }>
  >`
    SELECT m.group_id, m.feed_id, m.stop_id, s.direction_id
    FROM stop_group_members m
    JOIN stops s ON s.feed_id = m.feed_id AND s.stop_id = m.stop_id
  `;

  type Member = (typeof members)[number];
  const memberMap = new Map<string, Member[]>();
  for (const m of members) {
    if (!memberMap.has(m.group_id)) memberMap.set(m.group_id, []);
    memberMap.get(m.group_id)!.push(m);
  }

  const features = groups
    .filter((g) => {
      const mems = memberMap.get(g.id) ?? [];
      if (agencies.length && !mems.some((m) => agencies.includes(m.feed_id))) return false;
      if (dirs.length) {
        const hasDir = mems.some((m) => m.direction_id == null || dirs.includes(m.direction_id));
        if (!hasDir) return false;
      }
      return true;
    })
    .map((g) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [g.lon, g.lat] },
      properties: { groupId: g.id, name: g.name },
    }));

  return NextResponse.json({ type: "FeatureCollection", features });
}
