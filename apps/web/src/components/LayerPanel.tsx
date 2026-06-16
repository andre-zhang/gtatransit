"use client";

import Link from "next/link";
import { useState } from "react";
import { GoCheck } from "./GoCheck";
import { AGENCY_COLORS } from "@/lib/colors";
import { routePageHref } from "@/lib/detail-href";
import { layerRouteKey } from "@/lib/route-key";
import { ZOOM_ROUTES, ZOOM_STOPS } from "@/lib/map-zoom";
import type { FilterTree } from "@/lib/types";

type Props = {
  tree: FilterTree;
  zoom: number;
  selectedAgencies: Set<string>;
  selectedModes: Set<string>;
  selectedRoutes: Set<string>;
  vehicleDirs: Set<number>;
  stopDirs: Set<number>;
  showRoutes: boolean;
  showVehicles: boolean;
  showStops: boolean;
  onToggleAgency: (id: string) => void;
  onToggleMode: (key: string) => void;
  onToggleRoute: (key: string) => void;
  onToggleVehicleDir: (d: number) => void;
  onToggleStopDir: (d: number) => void;
  onToggleLayer: (layer: "routes" | "vehicles" | "stops") => void;
};

function Collapse({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-go-bg last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-go-bg/50"
      >
        <span className="go-section-title">{title}</span>
        <svg
          className={`h-4 w-4 text-go-slate transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export function LayerPanel(props: Props) {
  const {
    tree,
    zoom,
    selectedAgencies,
    selectedModes,
    selectedRoutes,
    vehicleDirs,
    stopDirs,
    showRoutes,
    showVehicles,
    showStops,
    onToggleAgency,
    onToggleMode,
    onToggleRoute,
    onToggleVehicleDir,
    onToggleStopDir,
    onToggleLayer,
  } = props;

  const [agenciesOpen, setAgenciesOpen] = useState(true);
  const [routesOpen, setRoutesOpen] = useState(true);
  const [vehiclesOpen, setVehiclesOpen] = useState(true);
  const [stopsOpen, setStopsOpen] = useState(true);

  return (
    <div className="flex max-h-[min(32rem,calc(100vh-6rem))] flex-col overflow-hidden border border-[#d9d9d9] bg-go-surface shadow-[var(--shadow-panel)]">
      <div className="border-b border-[#a61e14] bg-go-green px-4 py-2.5 text-white">
        <h2 className="text-sm font-bold tracking-wide">Layers</h2>
      </div>

      <div className="overflow-y-auto">
        <Collapse
          title="Agencies"
          open={agenciesOpen}
          onToggle={() => setAgenciesOpen((v) => !v)}
        >
          <p className="mb-3 text-xs text-go-slate">
            Choose which agencies appear on the map.
          </p>
          {tree.agencies.map((ag) => (
            <GoCheck
              key={ag.id}
              checked={selectedAgencies.has(ag.id)}
              onChange={() => onToggleAgency(ag.id)}
              label={
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: AGENCY_COLORS[ag.id] ?? "#007934" }}
                  />
                  {ag.name}
                </span>
              }
              className="mb-2 last:mb-0"
            />
          ))}
        </Collapse>

        <Collapse title="Routes" open={routesOpen} onToggle={() => setRoutesOpen((v) => !v)}>
          <GoCheck
            checked={showRoutes}
            onChange={() => onToggleLayer("routes")}
            label={`Show routes (z${ZOOM_ROUTES}+)`}
            className="mb-3"
          />
          {showRoutes && zoom < ZOOM_ROUTES && (
            <p className="mb-2 text-xs text-go-slate">Zoom in to load routes</p>
          )}
          {showRoutes &&
            tree.agencies
              .filter((ag) => selectedAgencies.has(ag.id))
              .map((ag) => (
                <div key={ag.id} className="mb-3 last:mb-0">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-go-slate">
                    {ag.name}
                  </div>
                  <div className="ml-1 space-y-2 border-l-2 border-go-bg pl-3">
                    {ag.modes.map((m) => {
                      const mKey = `${ag.id}:${m.type}`;
                      return (
                        <div key={mKey}>
                          <GoCheck
                            checked={selectedModes.has(mKey)}
                            onChange={() => onToggleMode(mKey)}
                            label={m.label}
                            className="[&_span:last-child]:text-sm [&_span:last-child]:font-normal [&_span:last-child]:text-go-slate"
                          />
                          {selectedModes.has(mKey) && (
                            <div className="ml-7 mt-1.5 space-y-1">
                              {m.routes.map((r, ri) => {
                                const rKey = layerRouteKey(ag.id, r, ri);
                                const routeLabel = r.shortName || r.longName || r.id;
                                return (
                                  <GoCheck
                                    key={rKey}
                                    checked={selectedRoutes.has(rKey)}
                                    onChange={() => onToggleRoute(rKey)}
                                    label={
                                      <Link
                                        href={routePageHref(ag.id, r.id)}
                                        className="hover:text-go-green"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {routeLabel}
                                      </Link>
                                    }
                                    className="[&_span:last-child]:text-xs [&_span:last-child]:font-normal [&_span:last-child]:text-go-slate"
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
        </Collapse>

        <Collapse title="Vehicles" open={vehiclesOpen} onToggle={() => setVehiclesOpen((v) => !v)}>
          <GoCheck
            checked={showVehicles}
            onChange={() => onToggleLayer("vehicles")}
            label="Show vehicles"
            className="mb-3"
          />
          {showVehicles && (
            <div className="ml-1 flex gap-2">
              {[0, 1].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onToggleVehicleDir(d)}
                  className={`rounded-sm px-3 py-1.5 text-xs font-bold transition ${
                    vehicleDirs.has(d)
                      ? "bg-go-green text-white"
                      : "bg-go-bg text-go-slate hover:bg-go-bg/80"
                  }`}
                >
                  Dir {d}
                </button>
              ))}
            </div>
          )}
        </Collapse>

        <Collapse title="Stops" open={stopsOpen} onToggle={() => setStopsOpen((v) => !v)}>
          <GoCheck
            checked={showStops}
            onChange={() => onToggleLayer("stops")}
            label={`Show stops (z${ZOOM_STOPS}+)`}
            className="mb-3"
          />
          {showStops && zoom < ZOOM_STOPS && (
            <p className="mb-2 text-xs text-go-slate">Zoom in to load stops</p>
          )}
          {showStops && (
            <div className="ml-1 flex gap-2">
              {[0, 1].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onToggleStopDir(d)}
                  className={`rounded-sm px-3 py-1.5 text-xs font-bold transition ${
                    stopDirs.has(d)
                      ? "bg-go-green text-white"
                      : "bg-go-bg text-go-slate hover:bg-go-bg/80"
                  }`}
                >
                  Dir {d}
                </button>
              ))}
            </div>
          )}
        </Collapse>
      </div>
    </div>
  );
}
