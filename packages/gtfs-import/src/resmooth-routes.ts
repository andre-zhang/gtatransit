/**
 * One-time: smooth route geometries in apps/web/public/demo/routes.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { smoothRouteLine } from "./smooth-line.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routesPath = join(__dirname, "../../../apps/web/public/demo/routes.json");

type Feature = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: number[][] };
  properties: { routeType?: number; [k: string]: unknown };
};

type FC = { type: "FeatureCollection"; features: Feature[] };

const raw = readFileSync(routesPath, "utf8");
const fc = JSON.parse(raw) as FC;

let changed = 0;
for (const f of fc.features) {
  const coords = f.geometry?.coordinates;
  if (!coords || coords.length < 3) continue;
  const rt = Number(f.properties?.routeType ?? 3);
  const smoothed = smoothRouteLine(coords, rt);
  if (smoothed.length !== coords.length || smoothed.some((c, i) => c[0] !== coords[i]![0] || c[1] !== coords[i]![1])) {
    f.geometry.coordinates = smoothed;
    changed++;
  }
}

writeFileSync(routesPath, JSON.stringify(fc));
console.log(`Smoothed ${changed}/${fc.features.length} routes → ${routesPath}`);
