/**
 * Append weekend / extra YRT service patterns to schedule shards without full rebuild.
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { buildFeedSchedules, loadGoStops } from "./build-demo-stops.js";
import { exportFeedCalendar } from "./export-feed-calendar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const dataDir = process.env.GTFS_DATA_DIR ?? join(root, "data/gtfs");
const outDir = join(root, "apps/web/public/demo");
const dir = join(dataDir, "extracted-demo", "yrt");
const BASENAME = "yrt-schedules";

/** Service patterns missing from the original weekday-only demo build. */
const APPEND_SERVICES = new Set(["153.0.2", "153.0.3"]);

function listExistingShards(): string[] {
  if (!existsSync(outDir)) return [];
  const re = new RegExp(`^${BASENAME}(?:\\.(\\d+))?\\.json$`);
  return readdirSync(outDir)
    .filter((f) => re.test(f))
    .sort((a, b) => {
      const idx = (n: string) => {
        const m = n.match(re);
        return m?.[1] !== undefined ? Number(m[1]) : -1;
      };
      return idx(a) - idx(b);
    });
}

async function main() {
  if (!existsSync(join(dir, "routes.txt"))) {
    console.error(`Missing YRT GTFS at ${dir}`);
    process.exit(1);
  }

  const stops = await loadGoStops(dir);
  const stopIds = new Set(stops.map((s) => s.stopId));

  const built = await buildFeedSchedules("yrt", dir, stopIds, {
    allServices: true,
    skipTripStops: true,
  });

  const appendOnly: Record<string, typeof built.schedulesByStop[string]> = {};
  let rows = 0;
  for (const [stopId, list] of Object.entries(built.schedulesByStop)) {
    const extra = list.filter((r) => APPEND_SERVICES.has(r.serviceId));
    if (extra.length) {
      appendOnly[stopId] = extra;
      rows += extra.length;
    }
  }
  console.log(`Append ${rows} rows for ${Object.keys(appendOnly).length} stops`);

  const existing = listExistingShards();
  let max = -1;
  const re = new RegExp(`^${BASENAME}\\.(\\d+)\\.json$`);
  for (const name of existing) {
    const m = name.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const shard = max + 1;
  const file = `${BASENAME}.${shard}.json`;
  writeFileSync(join(outDir, file), JSON.stringify(appendOnly));
  console.log(`Wrote ${file} (existing shards: ${existing.length})`);

  await exportFeedCalendar("yrt", dir, outDir);
  console.log("Run: node scripts/reshard-schedules.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
