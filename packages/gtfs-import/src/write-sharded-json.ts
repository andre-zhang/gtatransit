import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Keep shards under GitHub's 100 MB limit with headroom. */
const MAX_SHARD_BYTES = 85 * 1024 * 1024;

function shardPattern(basename: string): RegExp {
  return new RegExp(`^${basename}(?:\\.(\\d+))?\\.json$`);
}

export function removeShardedFiles(outDir: string, basename: string) {
  if (!existsSync(outDir)) return;
  const re = shardPattern(basename);
  for (const name of readdirSync(outDir)) {
    if (re.test(name)) unlinkSync(join(outDir, name));
  }
}

export function writeShardedRecord(
  outDir: string,
  basename: string,
  data: Record<string, unknown>,
) {
  // Caller should pass fully-built data; remove only after successful shard write below.

  const keys = Object.keys(data);
  if (!keys.length) {
    writeFileSync(join(outDir, `${basename}.json`), "{}");
    return;
  }

  const shards: Array<Record<string, unknown>> = [];
  let batch: Record<string, unknown> = {};

  for (const key of keys) {
    const next = { ...batch, [key]: data[key] };
    const bytes = Buffer.byteLength(JSON.stringify(next), "utf8");
    if (bytes > MAX_SHARD_BYTES && Object.keys(batch).length > 0) {
      shards.push(batch);
      batch = { [key]: data[key] };
    } else {
      batch = next;
    }
  }
  if (Object.keys(batch).length) shards.push(batch);

  removeShardedFiles(outDir, basename);

  if (shards.length === 1) {
    writeFileSync(join(outDir, `${basename}.json`), JSON.stringify(shards[0]));
    return;
  }

  for (let i = 0; i < shards.length; i++) {
    writeFileSync(join(outDir, `${basename}.${i}.json`), JSON.stringify(shards[i]));
  }
  console.log(`Wrote ${shards.length} shards for ${basename}`);
}
