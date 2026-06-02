"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { BASEMAP_STYLE, GTA_DEFAULT_ZOOM } from "@/lib/basemap";
import { ensureVehicleArrowImage, VEHICLE_ARROW_IMAGE_ID } from "@/lib/map-icons";

export function RunMap({
  lat,
  lon,
  shape,
}: {
  lat: number | null;
  lon: number | null;
  shape: GeoJSON.Feature | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || lat == null || lon == null) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: BASEMAP_STYLE,
      center: [lon, lat],
      zoom: GTA_DEFAULT_ZOOM + 3,
      attributionControl: { compact: true },
    });

    map.on("load", () => {
      if (shape?.geometry) {
        map.addSource("route", { type: "geojson", data: shape });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          paint: { "line-color": "#007934", "line-width": 4 },
        });
      }
      map.addSource("vehicle", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: { bearing: 0 },
        },
      });
      ensureVehicleArrowImage(map);
      map.addLayer({
        id: "vehicle",
        type: "symbol",
        source: "vehicle",
        layout: {
          "icon-image": VEHICLE_ARROW_IMAGE_ID,
          "icon-size": 0.38,
          "icon-rotate": ["coalesce", ["get", "bearing"], 0],
          "icon-rotation-alignment": "map",
        },
      });
    });

    return () => map.remove();
  }, [lat, lon, shape]);

  if (lat == null || lon == null) return null;
  return <div ref={ref} className="h-52 w-full border-b border-go-bg" />;
}
