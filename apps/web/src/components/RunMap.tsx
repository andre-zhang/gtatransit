"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { BASEMAP_STYLE, GTA_DEFAULT_ZOOM } from "@/lib/basemap";
import { ensureVehicleArrowImage, VEHICLE_ARROW_IMAGE_ID } from "@/lib/map-icons";

export function RunMap({
  lat,
  lon,
  bearing,
  shape,
  routeColor = "#007934",
}: {
  lat: number | null;
  lon: number | null;
  bearing?: number | null;
  shape: GeoJSON.Feature | null;
  routeColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || lat == null || lon == null) return;
    let map: maplibregl.Map | null = null;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: BASEMAP_STYLE,
        center: [lon, lat],
        zoom: GTA_DEFAULT_ZOOM + 3,
        attributionControl: { compact: true },
      });
    } catch (err) {
      console.error("RunMap init failed:", err);
      return;
    }

    map.on("load", () => {
      if (!map) return;
      try {
        if (shape?.geometry) {
          map.addSource("route", { type: "geojson", data: shape });
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            paint: { "line-color": routeColor, "line-width": 4 },
          });
        }
        map.addSource("vehicle", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: { bearing: bearing ?? 0 },
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
      } catch (err) {
        console.error("RunMap layer setup failed:", err);
      }
    });

    return () => map?.remove();
  }, [lat, lon, bearing, shape, routeColor]);

  if (lat == null || lon == null) return null;
  return <div ref={ref} className="h-52 w-full border-b border-go-bg" />;
}
