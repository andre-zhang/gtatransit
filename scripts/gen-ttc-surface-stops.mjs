import { createReadStream, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stopsPath =
  process.argv[2] ??
  join(root, "data/gtfs/tmp/surface/stops.txt");

const out = {};
const rl = createInterface({ input: createReadStream(stopsPath), crlfDelay: Infinity });
let header = [];
let lineNo = 0;

for await (const line of rl) {
  lineNo++;
  if (lineNo === 1) {
    header = line.split(",");
    continue;
  }
  if (!line.trim()) continue;
  const cols = parseCsvLine(line);
  const row = Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""]));
  const lat = Number(row.stop_lat);
  const lon = Number(row.stop_lon);
  if (!row.stop_id || Number.isNaN(lat)) continue;
  out[row.stop_id] = {
    stopCode: row.stop_code || null,
    name: row.stop_name,
    lat,
    lon,
  };
}

const outPath = join(root, "apps/web/public/demo/ttc-surface-stops.json");
writeFileSync(outPath, JSON.stringify(out));
console.log("wrote", outPath, Object.keys(out).length, "stops");

function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cols.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}
