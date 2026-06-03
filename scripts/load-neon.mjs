/**
 * One command: migrate + import GTFS + cluster stops into Neon/Postgres.
 * Needs either .env.local (from `vercel env pull`) or neon-direct-url.txt
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const pasteFile = resolve(root, "neon-direct-url.txt");
if (existsSync(pasteFile)) {
  process.env.DATABASE_URL = readFileSync(pasteFile, "utf8").trim();
} else if (process.env.POSTGRES_URL_NON_POOLING?.trim()) {
  process.env.DATABASE_URL = process.env.POSTGRES_URL_NON_POOLING.trim();
} else if (process.env.DATABASE_URL_UNPOOLED?.trim()) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED.trim();
} else {
  console.error("\nNo database URL found.\n");
  console.error("Easiest fix:");
  console.error("  1. Vercel.com -> your project -> Storage -> Neon");
  console.error("  2. Copy the DIRECT / non-pooling connection string");
  console.error("  3. Paste it into this file (one line, no quotes):");
  console.error(`     ${pasteFile}\n`);
  console.error("Or run:  npx vercel env pull .env.local\n");
  process.exit(1);
}

process.env.DEMO_MODE = "0";

function run(label, args) {
  console.log(`\n========== ${label} ==========\n`);
  const r = spawnSync("npx", ["pnpm@9.15.4", ...args], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env },
  });
  if (r.status !== 0) {
    console.error(`\nFailed: ${label}`);
    process.exit(r.status ?? 1);
  }
}

console.log("Using DATABASE_URL for import (DEMO_MODE=0)");
console.log("TTC import can take 30-60 minutes. Do not close this window.\n");

if (!existsSync(resolve(root, "data/gtfs/ttc.zip"))) {
  run("Download GTFS zips", ["fetch-gtfs"]);
}
run("Database schema", ["db:migrate"]);
run("Import GTFS (slow)", ["import-gtfs"]);
run("Merge nearby stops", ["cluster-stops"]);

console.log("\n========== All done ==========");
console.log("On Vercel, set environment variable:  DEMO_MODE = 0");
console.log("Then redeploy your site.\n");
