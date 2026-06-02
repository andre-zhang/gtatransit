import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { removeShardedFiles } from "./write-sharded-json.js";

const MAX_SHARD_BYTES = 85 * 1024 * 1024;

function escapeJsonKey(key: string): string {
  return JSON.stringify(key);
}

/** Stream top-level keys of a minified JSON object without JSON.parse of the whole file. */
function* iterateTopLevelObjectEntries(
  text: string,
): Generator<{ key: string; rawValue: string }> {
  if (!text.startsWith("{")) throw new Error("Expected JSON object");
  let i = 1;
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i]!)) i++;
    if (text[i] === "}") break;
    if (text[i] !== '"') throw new Error(`Expected key at ${i}`);
    const keyStart = i + 1;
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") i++;
      i++;
    }
    const key = JSON.parse(`"${text.slice(keyStart, i)}"`) as string;
    i++;
    while (i < text.length && text[i] !== "[") i++;
    const valStart = i;
    let depth = 0;
    do {
      const c = text[i];
      if (c === "[") depth++;
      else if (c === "]") depth--;
      i++;
    } while (depth > 0);
    yield { key, rawValue: text.slice(valStart, i) };
  }
}

function writeObjectShard(path: string, entries: Array<{ key: string; rawValue: string }>) {
  const body = entries
    .map(({ key, rawValue }) => `${escapeJsonKey(key)}:${rawValue}`)
    .join(",");
  writeFileSync(path, `{${body}}`);
}

export function shardJsonObjectFile(outDir: string, basename: string, sourcePath: string) {
  const text = readFileSync(sourcePath, "utf8");
  if (text.startsWith("version https://git-lfs.github.com")) {
    throw new Error(`${basename}: Git LFS pointer — run "git lfs pull" first`);
  }

  const shardEntries: Array<Array<{ key: string; rawValue: string }>> = [];
  let batch: Array<{ key: string; rawValue: string }> = [];
  let batchBytes = 2;

  for (const entry of iterateTopLevelObjectEntries(text)) {
    const piece = `${escapeJsonKey(entry.key)}:${entry.rawValue}`;
    const add = piece.length + (batch.length ? 1 : 0);
    if (batchBytes + add > MAX_SHARD_BYTES && batch.length > 0) {
      shardEntries.push(batch);
      batch = [entry];
      batchBytes = 2 + piece.length;
    } else {
      batch.push(entry);
      batchBytes += add;
    }
  }
  if (batch.length) shardEntries.push(batch);

  removeShardedFiles(outDir, basename);

  if (shardEntries.length === 1) {
    writeObjectShard(join(outDir, `${basename}.json`), shardEntries[0]!);
    console.log(`Wrote ${basename}.json`);
    return;
  }

  for (let i = 0; i < shardEntries.length; i++) {
    writeObjectShard(join(outDir, `${basename}.${i}.json`), shardEntries[i]!);
  }
  if (sourcePath.endsWith(`${basename}.json`) && existsSync(sourcePath)) {
    unlinkSync(sourcePath);
  }
  console.log(`Wrote ${shardEntries.length} shards for ${basename}`);
}
