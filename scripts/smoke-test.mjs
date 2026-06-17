#!/usr/bin/env node
/**
 * End-to-end smoke test for demo mode APIs across all feeds.
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? "http://localhost:3001";
const FEEDS = ["ttc", "go", "up", "miway", "brampton", "drt", "yrt"];

const STOP_GROUPS = {
  ttc: "ttc-1",
  go: "go-UN",
  up: "up-UN",
  miway: "miway-0001",
  brampton: "brampton-20",
  drt: "drt-1014",
  yrt: "yrt-9700",
  union: "toronto-union",
};

const ROUTES = {
  ttc: "501",
  go: "04260626-GT",
  up: "UP",
  miway: "1",
  brampton: "1",
  drt: "100",
  yrt: "1",
};

const failures = [];
const slow = [];

async function get(path, { maxMs = 30_000, expectStatus = 200 } = {}) {
  const url = `${BASE}${path}`;
  const t0 = performance.now();
  let res;
  const okStatuses = Array.isArray(expectStatus) ? expectStatus : [expectStatus];
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(maxMs) });
  } catch (e) {
    failures.push({ path, error: e.message });
    return null;
  }
  const ms = Math.round(performance.now() - t0);
  if (ms > 5000) slow.push({ path, ms });
  if (!okStatuses.includes(res.status)) {
    failures.push({ path, status: res.status, expectStatus: okStatuses, ms });
    return null;
  }
  try {
    return { json: await res.json(), ms, status: res.status };
  } catch {
    failures.push({ path, error: "invalid json", ms });
    return null;
  }
}

function loadLocalIndex(feed) {
  const demo = join(root, "apps/web/public/demo");
  try {
    return JSON.parse(readFileSync(join(demo, `${feed}-trip-stops-index.json`), "utf8"));
  } catch {
    try {
      const data = JSON.parse(readFileSync(join(demo, `${feed}-trip-stops.json`), "utf8"));
      return Object.fromEntries(Object.keys(data).slice(0, 1).map((k) => [k, "local"]));
    } catch {
      return null;
    }
  }
}

function loadBlockSample(feed, tripId) {
  try {
    const block = JSON.parse(
      readFileSync(join(root, "apps/web/public/demo", `${feed}-block-index.json`), "utf8"),
    );
    const bid = block.tripToBlock?.[tripId];
    const trips = bid ? (block.blocks[bid]?.length ?? 0) : 0;
    return { bid, trips };
  } catch {
    return { bid: null, trips: 0 };
  }
}

async function main() {
  console.log(`Smoke test → ${BASE}\n`);

  const health = await get("/api/health");
  if (!health) console.log("WARN health failed");

  const filters = await get("/api/filters");
  if (!filters?.json?.tree) failures.push({ path: "/api/filters", error: "missing tree" });

  const mapVehicles = await get("/api/map/vehicles", { maxMs: 60_000 });
  if (mapVehicles?.json?.type !== "FeatureCollection") {
    failures.push({ path: "/api/map/vehicles", error: "not FeatureCollection" });
  }

  // Union hub
  for (const q of ["?quick=1", ""]) {
    const r = await get(`/api/stops/toronto-union/departures${q ? q : ""}`);
    if (r && !Array.isArray(r.json?.rows)) {
      failures.push({ path: `/api/stops/toronto-union/departures${q}`, error: "no rows" });
    } else if (r) {
      console.log(`union departures${q || " full"}: ${r.json.rows.length} rows (${r.ms}ms)`);
    }
  }

  for (const feed of FEEDS) {
    const groupId = STOP_GROUPS[feed];
    const routeId = ROUTES[feed];

    // Stop board
    for (const q of ["?quick=1", ""]) {
      const r = await get(`/api/stops/${groupId}/departures${q}`, { maxMs: 60_000 });
      if (!r) continue;
      if (!Array.isArray(r.json?.rows)) {
        failures.push({ path: `${feed} departures${q}`, error: "no rows array" });
      } else {
        console.log(
          `${feed} board${q}: ${r.json.rows.length} rows, name=${r.json.name?.slice(0, 30)} (${r.ms}ms)`,
        );
      }
    }

    // Route API
    const route = await get(`/api/routes/${feed}/${encodeURIComponent(routeId)}`);
    if (route && !route.json?.route && !route.json?.headsigns) {
      failures.push({ path: `${feed} route`, error: "empty route payload" });
    }

    // Trip lite + full
    const idx = loadLocalIndex(feed);
    const tripId = idx ? Object.keys(idx)[0] : null;
    if (!tripId) {
      failures.push({ path: `${feed} trip`, error: "no trip id in index" });
      continue;
    }

    const lite = await get(
      `/api/trips/${feed}/${encodeURIComponent(tripId)}?lite=1`,
      { maxMs: 60_000 },
    );
    if (lite) {
      const n = lite.json?.stops?.length ?? 0;
      if (n === 0) failures.push({ path: `${feed} trip lite`, error: "0 stops" });
      else console.log(`${feed} trip lite: ${n} stops (${lite.ms}ms)`);
    }

    const full = await get(
      `/api/trips/${feed}/${encodeURIComponent(tripId)}`,
      { maxMs: 60_000 },
    );
    if (full && !full.json?.stops?.length) {
      failures.push({ path: `${feed} trip full`, error: "0 stops" });
    }

    const block = loadBlockSample(feed, tripId);
    if (block.trips <= 1) {
      console.log(`${feed} block: sample trip ${tripId} has ${block.trips} block trips (index ok)`);
    } else {
      console.log(`${feed} block: trip ${tripId} → block ${block.bid} (${block.trips} trips)`);
    }

    // Run API — use first departure with vehicle if available
    const dep = await get(`/api/stops/${groupId}/departures?quick=1`);
    const withVehicle = dep?.json?.rows?.find((r) => r.vehicleId);
    if (withVehicle) {
      const run = await get(
        `/api/runs/${feed}/${encodeURIComponent(withVehicle.vehicleId)}`,
        { maxMs: 60_000 },
      );
      if (run && !run.json?.vehicle && !run.json?.trip) {
        failures.push({ path: `${feed} run`, error: "empty run" });
      } else if (run) {
        const hasBlock =
          (run.json?.blockTrips?.length ?? 0) > 0 || run.json?.blockId;
        console.log(
          `${feed} run ${withVehicle.vehicleId}: block=${hasBlock ? "yes" : "no"} (${run.ms}ms)`,
        );
      }
    } else {
      console.log(`${feed} run: skipped (no live vehicle on board)`);
    }
  }

  // GO train detail (requires tripId + Metrolinx key — skip if unconfigured)
  const goTrip = loadLocalIndex("go");
  const goTripId = goTrip ? Object.keys(goTrip).find((t) => loadBlockSample("go", t).trips >= 3) : null;
  if (goTripId) {
    const td = await get(`/api/go/train-detail?tripId=${encodeURIComponent(goTripId)}`, {
      expectStatus: [200, 503],
    });
    if (td?.status === 503) console.log("go train-detail: skipped (no API key)");
  }

  // Run API — pick first live vehicle from map
  const vehicles = mapVehicles;
  if (vehicles?.json?.features?.length) {
    const v = vehicles.json.features[0].properties;
    const feed = v?.feedId;
    const vid = v?.vehicleId;
    if (feed && vid) {
      const run = await get(`/api/runs/${feed}/${encodeURIComponent(vid)}`, { maxMs: 60_000 });
      if (run) {
        const hasBlock = (run.json?.blockTrips?.length ?? 0) > 0;
        console.log(`live run ${feed}/${vid}: block=${hasBlock ? "yes" : "no"} (${run.ms}ms)`);
      }
    }
  } else {
    console.log("run: skipped (no live vehicles)");
  }

  // Pages (HTML 200)
  const pages = [
    "/",
    `/stop/${STOP_GROUPS.ttc}`,
    `/stop/toronto-union`,
    `/route/ttc/501`,
    `/route/go/${encodeURIComponent(ROUTES.go)}`,
    `/route/yrt/1`,
  ];
  for (const path of pages) {
    const url = `${BASE}${path}`;
    const t0 = performance.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const ms = Math.round(performance.now() - t0);
      if (res.status !== 200) failures.push({ path: `page ${path}`, status: res.status });
      else console.log(`page ${path}: ${ms}ms`);
    } catch (e) {
      failures.push({ path: `page ${path}`, error: e.message });
    }
  }

  console.log("\n--- Summary ---");
  if (slow.length) {
    console.log(`Slow (>${5000}ms): ${slow.length}`);
    for (const s of slow.slice(0, 10)) console.log(`  ${s.ms}ms ${s.path}`);
  }
  if (failures.length) {
    console.log(`FAILURES: ${failures.length}`);
    for (const f of failures) console.log(" ", JSON.stringify(f));
    process.exit(1);
  }
  console.log("All checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
