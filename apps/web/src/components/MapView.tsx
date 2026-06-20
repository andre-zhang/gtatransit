"use client";

import type { FeatureCollection } from "geojson";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import { LayerPanel } from "./LayerPanel";
import { MapZoomHint } from "./MapZoomHint";
import { RoutePicker, type RoutePick } from "./RoutePicker";
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
  const router = useRouter();
  const [, startTransition] = useTransition();
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<() => void>(() => {});
  const aliveRef = useRef(true);
  const agencies = filterTree?.agencies ?? [];

  const [zoom, setZoom] = useState(GTA_DEFAULT_ZOOM);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showVehicles, setShowVehicles] = useState(true);
  const [showStops, setShowStops] = useState(true);
  const [selectedAgencies, setSelectedAgencies] = useState<Set<string>>(
    () => new Set(agencies.map((a) => a.id)),
  );
  const [selectedModes, setSelectedModes] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const a of agencies) {
      for (const m of a.modes) s.add(`${a.id}:${m.type}`);
    }
    return s;
  });
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const a of agencies) {
      for (const m of a.modes) {
        for (const r of m.routes) s.add(`${a.id}:${r.id}`);
      }
    }
    return s;
  });
  const [vehicleDirs, setVehicleDirs] = useState<Set<number>>(() => new Set([0, 1]));
  const [stopDirs, setStopDirs] = useState<Set<number>>(() => new Set([0, 1]));
  const [layersOpen, setLayersOpen] = useState(false);
  const [routePicker, setRoutePicker] = useState<{
    x: number;
    y: number;
    routes: RoutePick[];
  } | null>(null);

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
    setRoutePicker(null);
    router.prefetch(href);
    startTransition(() => {
      router.push(href);
    });
  };

  const prefetchHref = (href: string) => {
    router.prefetch(href);
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
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2, 14, 4, 16, 6.5, 18, 10],
          "circle-color": "#ffffff",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0.75, 16, 1.25],
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
        id: "vehicles-hit",
        type: "circle",
        source: "vehicles",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 14, 12, 16, 16],
          "circle-opacity": 0,
        },
      });
      map.addLayer({
        id: "vehicles-arrow",
        type: "symbol",
        source: "vehicles",
        layout: {
          "icon-image": VEHICLE_ARROW_IMAGE_ID,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.18, 14, 0.28, 16, 0.38, 18, 0.48],
          "icon-rotate": ["coalesce", ["get", "bearing"], 0],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      map.on("click", "routes-hit", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["routes-hit"] });
        const seen = new Set<string>();
        const routes: RoutePick[] = [];
        for (const f of features) {
          const p = f.properties;
          if (!p?.feedId || !p?.routeId) continue;
          const key = `${p.feedId}:${p.routeId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          routes.push({
            feedId: String(p.feedId),
            routeId: String(p.routeId),
            routeShort: String(p.routeShort ?? p.routeId),
            color: String(p.color ?? "#007934"),
          });
        }
        if (!routes.length) return;
        if (routes.length === 1) {
          navigate(
            `/route/${routes[0]!.feedId}/${encodeURIComponent(routes[0]!.routeId)}`,
          );
          return;
        }
        setRoutePicker({ x: e.point.x, y: e.point.y, routes });
      });

      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["routes-hit"] });
        if (!hits.length) setRoutePicker(null);
      });

      map.on("mouseenter", "routes-hit", (e) => {
        const f = e.features?.[0];
        if (f?.properties?.feedId && f?.properties?.routeId) {
          prefetchHref(
            `/route/${f.properties.feedId}/${encodeURIComponent(String(f.properties.routeId))}`,
          );
        }
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "routes-hit", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("mouseenter", "stops-hit", (e) => {
        const f = e.features?.[0];
        if (f?.properties?.groupId) {
          prefetchHref(`/stop/${f.properties.groupId}`);
        }
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "stops-hit", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("mouseenter", "vehicles-hit", (e) => {
        const f = e.features?.[0];
        if (f?.properties?.feedId && f?.properties?.vehicleId) {
          prefetchHref(
            `/run/${f.properties.feedId}/${encodeURIComponent(String(f.properties.vehicleId))}`,
          );
        }
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "vehicles-hit", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "vehicles-hit", (e) => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        navigate(
          `/run/${f.properties.feedId}/${encodeURIComponent(f.properties.vehicleId)}`,
        );
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
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const map = mapRef.current;
      if (!map) return;
      map.resize();
      lastFetchKey.current = "";
      refreshRef.current();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
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
    }, 20_000);
    return () => clearInterval(id);
  }, [buildQuery, showVehicles]);

  const toggle = <T,>(set: Set<T>, val: T, fn: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    fn(next);
  };

  const layerPanel = (
    <LayerPanel
      tree={{ agencies }}
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
          const ag = agencies.find((a) => a.id === id);
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
  );

  return (
    <div className="relative h-[calc(100dvh-3rem)]">
      <div ref={containerRef} className="absolute inset-0 h-full w-full bg-[#e8ecf0]" />
      <div className="pointer-events-none absolute inset-0 z-10 hidden p-4 md:flex">
        <div className="pointer-events-auto w-[min(100%,20rem)]">{layerPanel}</div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-stretch p-3 md:hidden">
        {layersOpen && (
          <div className="pointer-events-auto mb-3 max-h-[min(50dvh,28rem)] overflow-hidden">
            {layerPanel}
          </div>
        )}
        <button
          type="button"
          className="pointer-events-auto ml-auto flex min-h-11 items-center gap-2 rounded-sm border border-[#d9d9d9] bg-go-surface px-4 py-2 text-sm font-bold text-go-navy shadow-[var(--shadow-panel)]"
          onClick={() => setLayersOpen((v) => !v)}
          aria-expanded={layersOpen}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 6h16M4 12h16M4 18h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Layers
        </button>
      </div>
      <MapZoomHint zoom={zoom} showRoutes={showRoutes} showStops={showStops} mobileLayersOpen={layersOpen} />
      {routePicker && (
        <div
          className="pointer-events-none absolute inset-0 z-30"
          aria-live="polite"
        >
          <div
            className="pointer-events-auto"
            style={{
              position: "absolute",
              left: routePicker.x,
              top: routePicker.y,
              transform: "translate(-50%, calc(-100% - 8px))",
            }}
          >
            <RoutePicker
              routes={routePicker.routes}
              onClose={() => setRoutePicker(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
