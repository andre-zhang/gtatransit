import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import "dotenv/config";
import { FEEDS } from "./feeds.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDir = process.env.GTFS_DATA_DIR ?? join(repoRoot, "data/gtfs");
mkdirSync(dataDir, { recursive: true });

async function download(url: string, dest: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  const body = res.body;
  if (!body) throw new Error(`No body for ${url}`);
  await pipeline(body, createWriteStream(dest));
  return createHash("sha256").update(readFileSync(dest)).digest("hex");
}

for (const feed of FEEDS) {
  if (feed.localPath && existsSync(feed.localPath)) {
    console.log(`${feed.id}: using local ${feed.localPath}`);
    continue;
  }
  if (!feed.url) {
    console.warn(`Skip ${feed.id}: no URL configured`);
    continue;
  }
  const dest = join(dataDir, `${feed.id}.zip`);
  try {
    const hash = await download(feed.url, dest);
    console.log(`${feed.id}: saved ${dest} (${hash.slice(0, 12)}…)`);
  } catch (e) {
    console.error(`${feed.id}:`, e);
  }
}
