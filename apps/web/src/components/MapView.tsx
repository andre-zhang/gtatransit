"use client";

import type { FeatureCollection } from "geojson";
import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { LayerPanel } from "./LayerPanel";
import { MapZoomHint } from "./MapZoomHint";
import { BASEMAP_STYLE, GTA_CENTER, GTA_DEFAULT_ZOOM } from "@/lib/basemap";
import { readSavedMapView, saveMapView } from "@/lib/map-view-state";
import { ensureVehicleArrowImage, VEHICLE_ARROW_IMAGE_ID } from "@/lib/map-icons";
import { ZOOM_ROUTES, ZOOM_STOPS } from "@/lib/map-zoom";
import type { FilterTree } from "@/lib/types";

const GTA_BOUNDS: [[number, number], [number, number]] = [
  [-80.2, 43.4],
  [-78.8, 44.2],
];

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

type Props = { filterTree: FilterTree; rtUpdated?: string | null; demoMode?: boolean };

export function MapView({ filterTree, rtUpdated, demoMode }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<() => void>(() => {});
  const aliveRef = useRef(true);

  const [zoom, setZoom] = useState(GTA_DEFAULT_ZOOM);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showVehicles, setShowVehicles] = useState(true);
  const [showStops, setShowStops] = useState(true);
  const [selectedAgencies, setSelectedAgencies] = useState<Set<string>>(
    () => new Set(filterTree.agencies.map((a) => a.id)),
  );
  const [selectedModes, setSelectedModes] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const a of filterTree.agencies) {
      for (const m of a.modes) s.add(`${a.id}:${m.type}`);
    }
    return s;
  });
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const a of filterTree.agencies) {
      for (const m of a.modes) {
        for (const r of m.routes) s.add(`${a.id}:${r.id}`);
      }
    }
    return s;
  });
  const [vehicleDirs, setVehicleDirs] = useState<Set<number>>(() => new Set([0, 1]));
  const [stopDirs, setStopDirs] = useState<Set<number>>(() => new Set([0, 1]));

  const buildQuery = useCallback(
    (map: maplibregl.Map) => {
      const b = map.getBounds();
      const params = new URLSearchParams();
      params.set("zoom", String(Math.floor(map.getZoom())));
      params.set(
        "bbox",
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(5)).join(","),
      );
      const agencies = [...selectedAgencies].join(",");
      const modes = [...selectedModes].join(",");
      const routes = [...selectedRoutes].join(",");
      if (agencies) params.set("agencies", agencies);
      if (modes) params.set("modes", modes);
      if (routes) params.set("routes", routes);
      if (vehicleDirs.size) params.set("directions", [...vehicleDirs].join(","));
      if (stopDirs.size) params.set("stopDirections", [...stopDirs].join(","));
      return params;
    },
    [selectedAgencies, selectedModes, selectedRoutes, vehicleDirs, stopDirs],
  );

  const setSource = (id: string, data: FeatureCollection) => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    try {
      (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);
    } catch {
      /* map removed while a fetch was in flight */
    }
  };

  const lastFetchKey = useRef("");

  const persistMapView = () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    saveMapView([c.lng, c.lat], map.getZoom());
  };

  const navigate = (href: string) => {
    persistMapView();
    window.location.assign(href);
  };

  const refreshLayers = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !aliveRef.current) return;

    const z = map.getZoom();
    setZoom(z);
    const params = buildQuery(map);
    const fetchKey = `${params.toString()}:${showRoutes}:${showStops}:${showVehicles}`;
    if (fetchKey === lastFetchKey.current) return;
    lastFetchKey.current = fetchKey;

    const tasks: Promise<void>[] = [];

    if (showRoutes && z >= ZOOM_ROUTES) {
      tasks.push(
        fetch(`/api/map/routes?${params}`)
          .then((res) => (res.ok ? res.json() : EMPTY_FC))
          .then((geo) => setSource("routes", geo)),
      );
    } else {
      setSource("routes", EMPTY_FC);
    }

    if (showVehicles && (!demoMode || z >= 10)) {
      tasks.push(
        fetch(`/api/map/vehicles?${params}`)
          .then((res) => (res.ok ? res.json() : EMPTY_FC))
          .then((geo) => setSource("vehicles", geo)),
      );
    } else {
      setSource("vehicles", EMPTY_FC);
    }

    if (showStops && z >= ZOOM_STOPS) {
      tasks.push(
        fetch(`/api/map/stops?${params}`)
          .then((res) => (res.ok ? res.json() : EMPTY_FC))
          .then((geo) => setSource("stops", geo)),
      );
    } else {
      setSource("stops", EMPTY_FC);
    }

    await Promise.all(tasks);
  }, [buildQuery, showRoutes, showVehicles, showStops, demoMode]);

  refreshRef.current = refreshLayers;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    aliveRef.current = true;
    const container = containerRef.current;

    const saved = readSavedMapView();
    const map = new maplibregl.Map({
      container,
      style: BASEMAP_STYLE,
      center: saved?.center ?? GTA_CENTER,
      zoom: saved?.zoom ?? GTA_DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);

    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => refreshRef.current(), 400);
    };

    map.on("error", (e) => {
      console.error("MapLibre error:", e.error?.message ?? e);
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      saveMapView([c.lng, c.lat], map.getZoom());
      scheduleRefresh();
    });
    map.on("zoomend", () => setZoom(map.getZoom()));

    map.on("load", () => {
      map.resize();
      if (!saved) {
        map.fitBounds(GTA_BOUNDS, { padding: 48, duration: 0 });
      }
      setZoom(map.getZoom());

      map.addSource("routes", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        minzoom: ZOOM_ROUTES,
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 5],
          "line-opacity": 0.9,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "routes-hit",
        type: "line",
        source: "routes",
        minzoom: ZOOM_ROUTES,
        paint: {
          "line-color": "#000000",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 12, 14, 18],
          "line-opacity": 0,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      map.addSource("stops", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "stops-circle",
        type: "circle",
        source: "stops",
        minzoom: ZOOM_STOPS,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 14, 2, 16, 2.75],
          "circle-color": "#ffffff",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#da291c",
        },
      });
      map.addLayer({
        id: "stops-hit",
        type: "circle",
        source: "stops",
        minzoom: ZOOM_STOPS,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 10, 14, 14, 16, 18],
          "circle-opacity": 0,
        },
      });

      map.addSource("vehicles", { type: "geojson", data: EMPTY_FC });
      ensureVehicleArrowImage(map);
      map.addLayer({
        id: "vehicles-arrow",
        type: "symbol",
        source: "vehicles",
        layout: {
          "icon-image": VEHICLE_ARROW_IMAGE_ID,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.26, 14, 0.34, 16, 0.42],
          "icon-rotate": ["coalesce", ["get", "bearing"], 0],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      map.on("click", "routes-hit", (e) => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        navigate(
          `/route/${f.properties.feedId}/${encodeURIComponent(String(f.properties.routeId))}`,
        );
      });

      map.on("mouseenter", "routes-hit", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "routes-hit", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("mouseenter", "stops-hit", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "stops-hit", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("mouseenter", "vehicles-arrow", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "vehicles-arrow", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "vehicles-arrow", (e) => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        navigate(
          `/run/${f.properties.feedId}/${encodeURIComponent(f.properties.vehicleId)}`,
        );
      });

      map.on("click", "stops-hit", (e) => {
        const f = e.features?.[0];
        if (!f?.properties?.groupId) return;
        navigate(`/stop/${f.properties.groupId}`);
      });

      map.getCanvas().style.cursor = "default";
      refreshRef.current();
    });

    return () => {
      aliveRef.current = false;
      if (moveTimer) clearTimeout(moveTimer);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    lastFetchKey.current = "";
    refreshLayers();
  }, [selectedAgencies, selectedModes, selectedRoutes, vehicleDirs, stopDirs, showRoutes, showVehicles, showStops, refreshLayers]);

  useEffect(() => {
    const id = setInterval(() => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded() || !showVehicles) return;
      const params = buildQuery(map);
      fetch(`/api/map/vehicles?${params}`)
        .then((r) => (r.ok ? r.json() : EMPTY_FC))
        .then((geo) => setSource("vehicles", geo));
    }, 15000);
    return () => clearInterval(id);
  }, [buildQuery, showVehicles]);

  const toggle = <T,>(set: Set<T>, val: T, fn: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    fn(next);
  };

  return (
    <div className="relative h-[calc(100vh-3rem)]">
      <div ref={containerRef} className="absolute inset-0 h-full w-full bg-[#e8ecf0]" />
      <div className="pointer-events-none absolute inset-0 z-10 flex p-4">
        <div className="pointer-events-auto w-[min(100%,20rem)]">
          <LayerPanel
            tree={filterTree}
            zoom={zoom}
            selectedAgencies={selectedAgencies}
            selectedModes={selectedModes}
            selectedRoutes={selectedRoutes}
            vehicleDirs={vehicleDirs}
            stopDirs={stopDirs}
            showRoutes={showRoutes}
            showVehicles={showVehicles}
            showStops={showStops}
            onToggleAgency={(id) => {
              const next = new Set(selectedAgencies);
              if (next.has(id)) {
                next.delete(id);
                setSelectedAgencies(next);
                setSelectedModes((modes) => {
                  const m = new Set(modes);
                  for (const key of m) if (key.startsWith(`${id}:`)) m.delete(key);
                  return m;
                });
                setSelectedRoutes((routes) => {
                  const r = new Set(routes);
                  for (const key of r) if (key.startsWith(`${id}:`)) r.delete(key);
                  return r;
                });
              } else {
                next.add(id);
                setSelectedAgencies(next);
                const ag = filterTree.agencies.find((a) => a.id === id);
                if (ag) {
                  setSelectedModes((modes) => {
                    const m = new Set(modes);
                    for (const mode of ag.modes) m.add(`${id}:${mode.type}`);
                    return m;
                  });
                  setSelectedRoutes((routes) => {
                    const r = new Set(routes);
                    for (const mode of ag.modes) {
                      for (const route of mode.routes) r.add(`${id}:${route.id}`);
                    }
                    return r;
                  });
                }
              }
            }}
            onToggleMode={(k) => toggle(selectedModes, k, setSelectedModes)}
            onToggleRoute={(k) => toggle(selectedRoutes, k, setSelectedRoutes)}
            onToggleVehicleDir={(d) => toggle(vehicleDirs, d, setVehicleDirs)}
            onToggleStopDir={(d) => toggle(stopDirs, d, setStopDirs)}
            onToggleLayer={(layer) => {
              if (layer === "routes") setShowRoutes((v) => !v);
              if (layer === "vehicles") setShowVehicles((v) => !v);
              if (layer === "stops") setShowStops((v) => !v);
            }}
          />
        </div>
      </div>
      <MapZoomHint zoom={zoom} showRoutes={showRoutes} showStops={showStops} />
    </div>
  );
}
