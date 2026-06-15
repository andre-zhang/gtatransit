import { lookupDemoRouteColor } from "./demo-route-colors";

/** GO rail line colours (official Metrolinx palette). */
const GO_RAIL_COLORS: Record<string, string> = {
  UP: "#0075d2",
  LW: "#98002e",
  LE: "#ff0d00",
  KI: "#00853e",
  GT: "#00853e",
  RH: "#0099c7",
  ST: "#794500",
  BR: "#003767",
  MI: "#f57f25",
};

export const AGENCY_COLORS: Record<string, string> = {
  ttc: "#da291c",
  go: "#007934",
  up: "#0075d2",
  yrt: "#0072ce",
  brampton: "#e87722",
  drt: "#003da5",
  miway: "#00a651",
};

export const AGENCY_NAMES: Record<string, string> = {
  ttc: "TTC",
  go: "GO",
  up: "UP",
  yrt: "YRT",
  brampton: "Brampton",
  drt: "DRT",
  miway: "MiWay",
};

export function routeColor(
  feedId: string,
  routeShortName: string | null,
  routeColorHex: string | null,
  routeId?: string | null,
): string {
  if (routeColorHex) return `#${routeColorHex.replace(/^#/, "")}`;

  const fromDemo = lookupDemoRouteColor(feedId, routeShortName, routeId);
  if (fromDemo) return fromDemo.startsWith("#") ? fromDemo : `#${fromDemo}`;

  if (feedId === "go" && routeShortName) {
    const rail = GO_RAIL_COLORS[routeShortName.toUpperCase()];
    if (rail) return rail;
  }

  return AGENCY_COLORS[feedId] ?? "#007934";
}

export const MODE_LABELS: Record<number, string> = {
  0: "Tram",
  1: "Subway",
  2: "Rail",
  3: "Bus",
  4: "Ferry",
};
