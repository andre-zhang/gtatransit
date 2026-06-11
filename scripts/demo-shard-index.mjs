/**
 * Build stop/trip → shard filename indexes and shard large single-file schedules.
 * Run after demo fixtures change: node scripts/demo-shard-index.mjs
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const demoDir = join(process.cwd(), "apps/web/public/demo");
const MAX_SHARD_BYTES = 4 * 1024 * 1024;

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
  const keys = Object.keys(data);
  if (!keys.length) return;

  const shards = [];
  let batch = {};
  for (const key of keys) {
    const next = { ...batch, [key]: data[key] };
    if (
      Buffer.byteLength(JSON.stringify(next), "utf8") > MAX_SHARD_BYTES &&
      Object.keys(batch).length > 0
    ) {
      shards.push(batch);
      batch = { [key]: data[key] };
    } else {
      batch = next;
    }
  }
  if (Object.keys(batch).length) shards.push(batch);

  if (shards.length <= 1) {
    console.log(`skip shard ${filename}: single shard`);
    return;
  }

  unlinkSync(path);
  for (let i = 0; i < shards.length; i++) {
    writeFileSync(
      join(demoDir, `${basename}.${i}.json`),
      JSON.stringify(shards[i]),
    );
  }
  console.log(`Sharded ${filename} → ${shards.length} parts`);
}

shardMonolith("go-schedules.json");
shardMonolith("go-trip-stops.json");
if (!listShards("miway-schedules").length) {
  shardMonolith("miway-schedules.json");
}
shardMonolith("miway-trip-stops.json");

for (const base of [
  "ttc-schedules",
  "ttc-trip-stops",
  "go-schedules",
  "go-trip-stops",
  "miway-schedules",
  "miway-trip-stops",
]) {
  writeShardIndex(base);
}
