/**
 * Build stop/trip → shard filename indexes and shard large single-file schedules.
 * Run after demo fixtures change: node scripts/demo-shard-index.mjs
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const demoDir = join(process.cwd(), "apps/web/public/demo");
const MAX_SHARD_BYTES = 4 * 1024 * 1024;
/** Trip-stop shards are read whole per lookup — keep them small. */
const MAX_TRIP_STOP_SHARD_BYTES = 2 * 1024 * 1024;

function shardBasename(name) {
  return name.replace(/\.json$/, "");
}

function listShards(basename) {
  const re = new RegExp(`^${basename}(?:\\.(\\d+))?\\.json$`);
  return readdirSync(demoDir)
    .filter((f) => re.test(f))
    .sort((a, b) => {
      const idx = (n) => {
        const m = n.match(re);
        return m?.[1] !== undefined ? Number(m[1]) : -1;
      };
      return idx(a) - idx(b);
    });
}

/** Fast top-level key scan without JSON.parse on huge shards. */
function topLevelKeys(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const keys = [];
  const re = /"((?:\\.|[^"\\])*)"\s*:\s*\[/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    keys.push(m[1].replace(/\\"/g, '"'));
  }
  return keys;
}

function writeShardIndex(basename) {
  const files = listShards(basename);
  if (!files.length) {
    console.log(`skip ${basename}: no files`);
    return;
  }

  const index = {};
  for (const file of files) {
    const keys = topLevelKeys(join(demoDir, file));
    for (const key of keys) index[key] = file;
  }

  const out = `${basename}-index.json`;
  writeFileSync(join(demoDir, out), JSON.stringify(index));
  console.log(`Wrote ${out} (${Object.keys(index).length} keys, ${files.length} shards)`);
}

function splitIntoShards(data, basename, maxBytes) {
  const keys = Object.keys(data);
  if (!keys.length) return [];

  const shards = [];
  let batch = {};
  for (const key of keys) {
    const next = { ...batch, [key]: data[key] };
    if (
      Buffer.byteLength(JSON.stringify(next), "utf8") > maxBytes &&
      Object.keys(batch).length > 0
    ) {
      shards.push(batch);
      batch = { [key]: data[key] };
    } else {
      batch = next;
    }
  }
  if (Object.keys(batch).length) shards.push(batch);
  return shards;
}

function writeShards(basename, shards) {
  for (const file of listShards(basename)) {
    unlinkSync(join(demoDir, file));
  }
  for (let i = 0; i < shards.length; i++) {
    writeFileSync(
      join(demoDir, `${basename}.${i}.json`),
      JSON.stringify(shards[i]),
    );
  }
  console.log(`Sharded ${basename} → ${shards.length} parts`);
}

/** Re-split when any existing shard still exceeds the byte limit. */
function reshardIfOversized(basename, maxBytes) {
  const files = listShards(basename);
  if (!files.length) return;

  const oversized = files.some(
    (file) => statSync(join(demoDir, file)).size > maxBytes,
  );
  if (!oversized) {
    console.log(`skip reshard ${basename}: all shards under ${(maxBytes / 1e6).toFixed(1)}MB`);
    return;
  }

  console.log(`Resharding ${basename} (oversized shard detected)...`);
  const merged = {};
  for (const file of files) {
    Object.assign(merged, JSON.parse(readFileSync(join(demoDir, file), "utf8")));
  }
  const shards = splitIntoShards(merged, basename, maxBytes);
  if (shards.length <= 1) {
    console.log(`skip reshard ${basename}: would remain single shard`);
    return;
  }
  writeShards(basename, shards);
}

function shardMonolith(filename) {
  const path = join(demoDir, filename);
  if (!existsSync(path)) return;

  const basename = shardBasename(filename);
  if (listShards(basename).length > 1) {
    console.log(`skip shard ${filename}: already sharded`);
    return;
  }

  const raw = readFileSync(path, "utf8");
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes <= MAX_SHARD_BYTES) {
    console.log(`skip shard ${filename}: ${(bytes / 1e6).toFixed(1)}MB`);
    return;
  }

  const data = JSON.parse(raw);
  const shards = splitIntoShards(data, basename, MAX_SHARD_BYTES);
  if (shards.length <= 1) {
    console.log(`skip shard ${filename}: single shard`);
    return;
  }

  unlinkSync(path);
  writeShards(basename, shards);
}

shardMonolith("go-schedules.json");
shardMonolith("go-trip-stops.json");
if (!listShards("miway-schedules").length) {
  shardMonolith("miway-schedules.json");
}
shardMonolith("miway-trip-stops.json");
shardMonolith("yrt-schedules.json");
shardMonolith("yrt-trip-stops.json");
shardMonolith("brampton-schedules.json");
shardMonolith("brampton-trip-stops.json");
shardMonolith("drt-schedules.json");
shardMonolith("drt-trip-stops.json");

for (const base of [
  "ttc-trip-stops",
  "miway-trip-stops",
  "yrt-trip-stops",
  "brampton-trip-stops",
  "drt-trip-stops",
  "go-trip-stops",
]) {
  reshardIfOversized(base, MAX_TRIP_STOP_SHARD_BYTES);
}

for (const base of [
  "ttc-schedules",
  "ttc-trip-stops",
  "go-schedules",
  "go-trip-stops",
  "miway-schedules",
  "miway-trip-stops",
  "yrt-schedules",
  "yrt-trip-stops",
  "brampton-schedules",
  "brampton-trip-stops",
  "drt-schedules",
  "drt-trip-stops",
]) {
  writeShardIndex(base);
}

const shardManifest = {};
const shardRe = /^(.*-(?:schedules|trip-stops))(?:\.\d+)?\.json$/;
for (const name of readdirSync(demoDir)) {
  const m = name.match(shardRe);
  if (!m) continue;
  const base = m[1];
  if (!shardManifest[base]) shardManifest[base] = [];
  shardManifest[base].push(name);
}
for (const key of Object.keys(shardManifest)) {
  shardManifest[key].sort((a, b) => {
    const idx = (n) => {
      const hit = n.match(/\.(\d+)\.json$/);
      return hit ? Number(hit[1]) : -1;
    };
    return idx(a) - idx(b);
  });
}
writeFileSync(join(demoDir, "shard-manifest.json"), JSON.stringify(shardManifest));
console.log(`Wrote shard-manifest.json (${Object.keys(shardManifest).length} bases)`);
