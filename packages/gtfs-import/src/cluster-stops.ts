import "dotenv/config";
import { getSql, closeDb } from "@gta/db";
import { randomUUID } from "node:crypto";

const RADIUS_M = 40;
const RAIL_RADIUS_M = 25;

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!));
    return this.parent.get(x)!;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

async function main() {
  const sql = getSql();
  console.log("Clearing stop groups…");
  await sql`DELETE FROM stop_group_members`;
  await sql`DELETE FROM stop_groups`;

  const stops = await sql<
    Array<{
      feed_id: string;
      stop_id: string;
      name: string;
      lat: number;
      lon: number;
      bearing: number | null;
      direction_id: number | null;
      location_type: number | null;
      parent_station: string | null;
      trip_count: number | null;
    }>
  >`
    SELECT feed_id, stop_id, name, lat, lon, bearing, direction_id, location_type, parent_station, trip_count
    FROM stops
    WHERE location_type IS NULL OR location_type IN (0, 1)
    ORDER BY trip_count DESC NULLS LAST
  `;

  const key = (f: string, s: string) => `${f}:${s}`;
  const uf = new UnionFind();
  const byKey = new Map(stops.map((s) => [key(s.feed_id, s.stop_id), s]));

  for (const stop of stops) {
    const radius = stop.location_type === 1 ? RAIL_RADIUS_M : RADIUS_M;
    const neighbors = await sql<
      Array<{ feed_id: string; stop_id: string; bearing: number | null; parent_station: string | null }>
    >`
      SELECT s.feed_id, s.stop_id, s.bearing, s.parent_station
      FROM stops s
      WHERE s.feed_id || ':' || s.stop_id <> ${key(stop.feed_id, stop.stop_id)}
        AND ST_DWithin(
          s.geom::geography,
          ST_SetSRID(ST_MakePoint(${stop.lon}, ${stop.lat}), 4326)::geography,
          ${radius}
        )
    `;

    for (const n of neighbors) {
      const a = stop.bearing;
      const b = n.bearing;
      if (
        stop.parent_station &&
        n.parent_station &&
        stop.parent_station === n.parent_station &&
        stop.feed_id === n.feed_id
      ) {
        uf.union(key(stop.feed_id, stop.stop_id), key(n.feed_id, n.stop_id));
        continue;
      }
      if (a != null && b != null && angleDiff(a, b) > 90) continue;
      if (a != null && b != null && stop.direction_id != null && byKey.get(key(n.feed_id, n.stop_id))?.direction_id != null) {
        const nd = byKey.get(key(n.feed_id, n.stop_id))!.direction_id;
        if (stop.direction_id !== nd && angleDiff(a, b) > 45) continue;
      }
      uf.union(key(stop.feed_id, stop.stop_id), key(n.feed_id, n.stop_id));
    }
  }

  const clusters = new Map<string, string[]>();
  for (const stop of stops) {
    const root = uf.find(key(stop.feed_id, stop.stop_id));
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(key(stop.feed_id, stop.stop_id));
  }

  let count = 0;
  for (const members of clusters.values()) {
    const items = members.map((m) => byKey.get(m)!).filter(Boolean);
    if (!items.length) continue;
    items.sort((a, b) => (b.trip_count ?? 0) - (a.trip_count ?? 0));
    const primary = items[0]!;
    const avgLat = items.reduce((s, i) => s + i.lat, 0) / items.length;
    const avgLon = items.reduce((s, i) => s + i.lon, 0) / items.length;
    const bearings = items.map((i) => i.bearing).filter((b): b is number => b != null);
    const avgBearing = bearings.length
      ? bearings.reduce((a, b) => a + b, 0) / bearings.length
      : null;
    const groupId = randomUUID();

    await sql`
      INSERT INTO stop_groups (id, name, lat, lon, bearing, geom)
      VALUES (
        ${groupId}, ${primary.name}, ${avgLat}, ${avgLon}, ${avgBearing},
        ST_SetSRID(ST_MakePoint(${avgLon}, ${avgLat}), 4326)
      )
    `;

    for (const item of items) {
      await sql`
        INSERT INTO stop_group_members (group_id, feed_id, stop_id)
        VALUES (${groupId}, ${item.feed_id}, ${item.stop_id})
      `;
    }
    count++;
  }

  console.log(`Created ${count} stop groups`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
