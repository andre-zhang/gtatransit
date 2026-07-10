/**
 * Reshard oversized schedule/trip-stop files into small parts with linear cost
 * (no repeated JSON.stringify of the whole batch), then rebuild the
 * per-key shard indexes and shard-manifest.json.
 *
 * When both a monolith (base.json) and numbered shards exist, the monolith is
 * treated as the source of truth (first occurrence of a key wins).
 *
 * Run: node --max-old-space-size=6144 scripts/reshard-schedules.mjs
 */
import {
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const demoDir = join(process.cwd(), "apps/web/public/demo");
const MAX_SCHEDULE_BYTES = 4 * 1024 * 1024;
/** Trip-stop shards are fetched whole per trip lookup — keep them small. */
const MAX_TRIP_STOP_BYTES = 2 * 1024 * 1024;

function listShards(basename, { includeMonolith = true } = {}) {
  const re = new RegExp(`^${basename}(?:\\.(\\d+))?\\.json$`);
  const files = readdirSync(demoDir)
    .filter((f) => re.test(f))
    .sort((a, b) => {
      const idx = (n) => {
        const m = n.match(re);
        return m?.[1] !== undefined ? Number(m[1]) : -1;
      };
      return idx(a) - idx(b);
    });
  if (includeMonolith) return files;
  const numbered = files.filter((f) => /\.\d+\.json$/.test(f));
  return numbered.length ? numbered : files;
}

/** True when a monolith exists alongside shards, or any file exceeds the limit. */
function needsReshard(basename, maxBytes) {
  const files = listShards(basename);
  if (!files.length) return false;
  const hasMonolith = files.some((f) => !/\.\d+\.json$/.test(f));
  const numbered = files.filter((f) => /\.\d+\.json$/.test(f));
  if (hasMonolith && numbered.length) return true;
  return files.some(
    (f) => statSync(join(demoDir, f)).size > maxBytes + 512 * 1024,
  );
}

function reshard(basename, maxBytes) {
  if (!needsReshard(basename, maxBytes)) {
    console.log(`skip ${basename}`);
    return;
  }
  const files = listShards(basename);
  console.log(`resharding ${basename} (${files.length} input files)...`);

  const seen = new Set();
  let partIdx = 0;
  let chunks = [];
  let bytes = 2;
  const written = [];

  const flush = () => {
    if (!chunks.length) return;
    const tmp = join(demoDir, `${basename}.tmp-${partIdx}.json`);
    writeFileSync(tmp, `{${chunks.join(",")}}`);
    written.push({ tmp, final: `${basename}.${partIdx}.json` });
    partIdx += 1;
    chunks = [];
    bytes = 2;
  };

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(demoDir, file), "utf8"));
    for (const [key, value] of Object.entries(data)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = `${JSON.stringify(key)}:${JSON.stringify(value)}`;
      if (bytes + entry.length + 1 > maxBytes && chunks.length) flush();
      chunks.push(entry);
      bytes += entry.length + 1;
    }
  }
  flush();

  for (const file of files) unlinkSync(join(demoDir, file));
  for (const { tmp, final } of written) {
    renameSync(tmp, join(demoDir, final));
  }
  console.log(`  ${basename}: ${seen.size} keys -> ${written.length} shards`);
}

/** Fast top-level key scan without JSON.parse (values must be arrays). */
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
  const files = listShards(basename, { includeMonolith: false });
  if (!files.length) return;
  const index = {};
  for (const file of files) {
    for (const key of topLevelKeys(join(demoDir, file))) {
      if (!(key in index)) index[key] = file;
    }
  }
  writeFileSync(join(demoDir, `${basename}-index.json`), JSON.stringify(index));
  console.log(`wrote ${basename}-index.json (${Object.keys(index).length} keys, ${files.length} shards)`);
}

const SCHEDULE_BASES = [
  "ttc-schedules",
  "go-schedules",
  "up-schedules",
  "miway-schedules",
  "brampton-schedules",
  "yrt-schedules",
  "drt-schedules",
];
const TRIP_STOP_BASES = [
  "ttc-trip-stops",
  "go-trip-stops",
  "up-trip-stops",
  "miway-trip-stops",
  "brampton-trip-stops",
  "yrt-trip-stops",
  "drt-trip-stops",
];

for (const base of SCHEDULE_BASES) reshard(base, MAX_SCHEDULE_BYTES);
for (const base of TRIP_STOP_BASES) reshard(base, MAX_TRIP_STOP_BYTES);

for (const base of [...SCHEDULE_BASES, ...TRIP_STOP_BASES]) {
  writeShardIndex(base);
}

// Manifest lists numbered shards when they exist, else the monolith.
const manifest = {};
for (const base of [...SCHEDULE_BASES, ...TRIP_STOP_BASES]) {
  const files = listShards(base, { includeMonolith: false });
  if (files.length) manifest[base] = files;
}
writeFileSync(join(demoDir, "shard-manifest.json"), JSON.stringify(manifest));
console.log(`wrote shard-manifest.json (${Object.keys(manifest).length} bases)`);
