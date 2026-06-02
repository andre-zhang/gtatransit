/**
 * Re-shard large demo JSON files for GitHub/Vercel (no Git LFS pointers).
 * Usage: pnpm --filter @gta/gtfs-import split-demo
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shardJsonObjectFile } from "./split-demo-stream.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoDir = join(__dirname, "../../../apps/web/demo");

const TARGETS = ["ttc-schedules", "ttc-trip-stops"] as const;

for (const base of TARGETS) {
  const path = join(demoDir, `${base}.json`);
  if (!existsSync(path)) {
    console.warn(`Skip ${base}: missing ${path}`);
    continue;
  }
  shardJsonObjectFile(demoDir, base, path);
}
