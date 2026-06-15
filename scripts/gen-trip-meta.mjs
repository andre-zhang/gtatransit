#!/usr/bin/env node
/**
 * Build compact block-index JSON (multi-trip blocks only) for demo vehicle view.
 */
import { createReadStream, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gtfsRoot = join(root, "data", "gtfs");
const outDir = join(root, "apps", "web", "public", "demo");
const FEEDS = ["go", "miway", "ttc"];
/** Match demo fixture service day (GO trip ids embed this date). */
const SERVICE_DATE = process.env.SERVICE_DATE ?? new Date().toISOString().slice(0, 10).replace(/-/g, "");

function gtfsDirFor(feedId) {
  return join(gtfsRoot, "extracted-demo", feedId);
}

function pick(row, key) {
  return row[key] ?? "";
}

async function readCsv(path) {
  const rows = [];
  if (!existsSync(path)) return rows;
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!headers) {
      headers = line.split(",").map((h) => h.trim().replace(/^\uFEFF/, ""));
      continue;
    }
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

async function buildTripMetaIndex(feedId, trips) {
  const index = {};
  for (const row of trips) {
    const tripId = pick(row, "trip_id");
    const serviceId = pick(row, "service_id");
    if (!tripId) continue;
    if (
      feedId === "go" &&
      serviceId &&
      serviceId !== SERVICE_DATE &&
      !tripId.includes(SERVICE_DATE)
    ) {
      continue;
    }
    const headsign = pick(row, "trip_headsign");
    if (!headsign) continue;
    const direction = pick(row, "direction_id");
    const dir = direction !== "" ? Number(direction) : undefined;
    index[tripId] = dir != null && !Number.isNaN(dir) ? [headsign, dir] : [headsign];
  }
  const outPath = join(outDir, `${feedId}-trip-meta.json`);
  writeFileSync(outPath, JSON.stringify(index));
  const kb = Math.round(JSON.stringify(index).length / 1024);
  console.log(`${feedId}: ${Object.keys(index).length} trip meta (~${kb} KB)`);
}

async function buildBlockIndex(feedId) {
  const gtfsDir = gtfsDirFor(feedId);
  const trips = await readCsv(join(gtfsDir, "trips.txt"));
  if (!trips.length) {
    console.warn(`skip ${feedId}: no trips.txt`);
    return;
  }
  await buildTripMetaIndex(feedId, trips);
  const stopTimes = await readCsv(join(gtfsDir, "stop_times.txt"));

  const firstDep = new Map();
  const lastDep = new Map();
  for (const row of stopTimes) {
    const tid = pick(row, "trip_id");
    const dep = pick(row, "departure_time");
    if (!tid || !dep) continue;
    const prev = firstDep.get(tid);
    if (!prev || dep < prev) firstDep.set(tid, dep);
    const prevLast = lastDep.get(tid);
    if (!prevLast || dep > prevLast) lastDep.set(tid, dep);
  }

  const blocks = new Map();
  for (const row of trips) {
    const tripId = pick(row, "trip_id");
    const blockId = pick(row, "block_id");
    const serviceId = pick(row, "service_id");
    if (!tripId || !blockId) continue;
    if (
      feedId === "go" &&
      serviceId &&
      serviceId !== SERVICE_DATE &&
      !tripId.includes(SERVICE_DATE)
    ) {
      continue;
    }
    if (!blocks.has(blockId)) blocks.set(blockId, []);
    blocks.get(blockId).push({
      trip_id: tripId,
      headsign: pick(row, "trip_headsign") || null,
      first_departure: firstDep.get(tripId) ?? "—",
      last_departure: lastDep.get(tripId) ?? "—",
    });
  }

  const blockIndex = {};
  const tripToBlock = {};
  for (const [blockId, list] of blocks) {
    if (list.length <= 1) continue;
    list.sort((a, b) => a.first_departure.localeCompare(b.first_departure));
    const compact = list.map((t) => ({
      trip_id: t.trip_id,
      first_departure: (t.first_departure ?? "—").slice(0, 5),
      last_departure: (t.last_departure ?? t.first_departure ?? "—").slice(0, 5),
      ...(t.headsign ? { headsign: t.headsign } : {}),
    }));
    blockIndex[blockId] = compact;
    for (const t of compact) tripToBlock[t.trip_id] = blockId;
  }

  const payload = { blocks: blockIndex, tripToBlock };
  const outPath = join(outDir, `${feedId}-block-index.json`);
  writeFileSync(outPath, JSON.stringify(payload));
  const kb = Math.round(JSON.stringify(payload).length / 1024);
  console.log(`${feedId}: ${Object.keys(blockIndex).length} blocks (~${kb} KB)`);
}

for (const feedId of FEEDS) {
  await buildBlockIndex(feedId);
}
