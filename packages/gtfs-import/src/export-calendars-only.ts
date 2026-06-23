/**
 * Export feed-calendar.json for regional feeds (no schedule rebuild).
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exportFeedCalendar } from "./export-feed-calendar.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const dataDir = join(root, "data/gtfs/extracted-demo");
const outDir = join(root, "apps/web/public/demo");

for (const feedId of ["yrt", "brampton", "drt"] as const) {
  const dir = join(dataDir, feedId);
  if (!existsSync(join(dir, "routes.txt"))) {
    console.warn(`Skip ${feedId}: missing ${dir}`);
    continue;
  }
  await exportFeedCalendar(feedId, dir, outDir);
  console.log(`Wrote ${feedId}-calendar.json`);
}
