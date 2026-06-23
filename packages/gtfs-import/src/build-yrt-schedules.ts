/**
 * Rebuild YRT schedule shards with all service patterns + calendar export.
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";
import "dotenv/config";
import { buildFeedSchedules, loadGoStops } from "./build-demo-stops.js";
import { exportFeedCalendar } from "./export-feed-calendar.js";
import { writeShardedRecord } from "./write-sharded-json.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const dataDir = process.env.GTFS_DATA_DIR ?? join(root, "data/gtfs");
const outDir = join(root, "apps/web/public/demo");
const feedId = "yrt";

async function extractZip(zipPath: string, outDir: string): Promise<string | null> {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  await pipeline(createReadStream(zipPath), unzipper.Extract({ path: outDir }));
  function find(dir: string): string | null {
    if (existsSync(join(dir, "routes.txt"))) return dir;
    for (const name of readdirSync(dir)) {
      const f = find(join(dir, name));
      if (f) return f;
    }
    return null;
  }
  return find(outDir);
}

async function main() {
  const zipPath = join(dataDir, `${feedId}.zip`);
  if (!existsSync(zipPath)) {
    console.error(`Missing ${zipPath}`);
    process.exit(1);
  }
  const extractDir = join(dataDir, "extracted-demo", feedId);
  const dir = await extractZip(zipPath, extractDir);
  if (!dir) {
    console.error("Could not extract YRT GTFS");
    process.exit(1);
  }

  console.log("Building YRT schedules (all service patterns)…");
  const stops = await loadGoStops(dir);
  const stopIds = new Set(stops.map((s) => s.stopId));
  const built = await buildFeedSchedules(feedId, dir, stopIds, {
    allServices: true,
    skipTripStops: true,
  });
  console.log(
    `Built ${Object.keys(built.schedulesByStop).length} stops`,
  );

  writeShardedRecord(outDir, `${feedId}-schedules`, built.schedulesByStop);
  await exportFeedCalendar(feedId, dir, outDir);

  const shardManifest: Record<string, string[]> = {};
  const shardRe = /^(.*-(?:schedules|trip-stops))(?:\.\d+)?\.json$/;
  for (const name of readdirSync(outDir)) {
    const m = name.match(shardRe);
    if (!m) continue;
    const base = m[1]!;
    if (!shardManifest[base]) shardManifest[base] = [];
    shardManifest[base]!.push(name);
  }
  for (const key of Object.keys(shardManifest)) {
    shardManifest[key]!.sort((a, b) => {
      const idx = (n: string) => {
        const hit = n.match(/\.(\d+)\.json$/);
        return hit ? Number(hit[1]) : -1;
      };
      return idx(a) - idx(b);
    });
  }
  const existing = JSON.parse(readFileSync(join(outDir, "shard-manifest.json"), "utf8"));
  writeFileSync(
    join(outDir, "shard-manifest.json"),
    JSON.stringify({ ...existing, ...shardManifest }),
  );
  console.log("Done — run: node scripts/demo-shard-index.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
