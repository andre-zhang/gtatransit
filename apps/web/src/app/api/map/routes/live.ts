import type { Feature, FeatureCollection, LineString } from "geojson";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { routeColor } from "@/lib/colors";
import { filterRouteCollection, mapQueryParams } from "@/lib/geojson-map";
import { parseList } from "@/lib/parse-filters";

export default async function liveRoutes(req: NextRequest) {
  const { zoom, bbox } = mapQueryParams(req.nextUrl.searchParams);
  const agencies = parseList(req.nextUrl.searchParams.get("agencies"));
  const modes = parseList(req.nextUrl.searchParams.get("modes"));
  const routes = parseList(req.nextUrl.searchParams.get("routes"));

  const db = getSql();
  const rawRows = bbox
    ? await db<
        Array<{
          feed_id: string;
          route_id: string;
          direction_id: number;
          geojson: string;
          short_name: string | null;
          route_type: number;
          color: string | null;
        }>
      >`
        SELECT rs.feed_id, rs.route_id, rs.direction_id, rs.geojson,
               r.short_name, r.route_type, r.color
        FROM route_shapes rs
        JOIN routes r ON r.feed_id = rs.feed_id AND r.route_id = rs.route_id
        WHERE rs.geojson IS NOT NULL
          AND rs.geom && ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326)
      `
    : await db<
        Array<{
          feed_id: string;
          route_id: string;
          direction_id: number;
          geojson: string;
          short_name: string | null;
          route_type: number;
          color: string | null;
        }>
      >`
        SELECT rs.feed_id, rs.route_id, rs.direction_id, rs.geojson,
               r.short_name, r.route_type, r.color
        FROM route_shapes rs
        JOIN routes r ON r.feed_id = rs.feed_id AND r.route_id = rs.route_id
        WHERE rs.geojson IS NOT NULL
      `;

  let rows = [...rawRows];
  if (agencies.length) rows = rows.filter((r) => agencies.includes(r.feed_id));
  if (modes.length) {
    const modeSet = new Set(
      modes.map((m) => {
        const [, t] = m.split(":");
        return t;
      }),
    );
    rows = rows.filter(
      (r) => modeSet.has(String(r.route_type)) || modes.includes(`${r.feed_id}:${r.route_type}`),
    );
  }
  if (routes.length) {
    rows = rows.filter((r) => routes.includes(`${r.feed_id}:${r.route_id}`));
  }

  const features = rows.map((r) => {
    const parsed = JSON.parse(r.geojson) as Feature<LineString>;
    const coords = parsed.geometry?.coordinates ?? [];
    return {
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: coords },
      properties: {
        feedId: r.feed_id,
        routeId: r.route_id,
        routeShort: r.short_name,
        directionId: r.direction_id,
        routeType: r.route_type,
        color: routeColor(r.feed_id, r.short_name, r.color),
      },
    };
  });

  const fc = filterRouteCollection(
    { type: "FeatureCollection", features },
    bbox,
    zoom,
  );

  return NextResponse.json(fc);
}
