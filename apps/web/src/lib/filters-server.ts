import { getSql } from "@/lib/db";
import { MODE_LABELS } from "@/lib/colors";
import { getDemoCore, isDemoMode } from "@/lib/demo";
import type { FilterTree } from "@/lib/types";

export async function getFilterTree(): Promise<{
  tree: FilterTree;
  rtUpdated: string | null;
}> {
  if (isDemoMode()) {
    const demo = getDemoCore();
    return { tree: demo.filterTree as FilterTree, rtUpdated: demo.rtUpdated };
  }
  const db = getSql();
  const feeds = await db<Array<{ id: string; name: string }>>`SELECT id, name FROM feeds ORDER BY name`;
  const routes = await db<
    Array<{
      feed_id: string;
      route_id: string;
      short_name: string | null;
      long_name: string | null;
      route_type: number;
    }>
  >`SELECT feed_id, route_id, short_name, long_name, route_type FROM routes ORDER BY short_name`;

  const tree: FilterTree = { agencies: [] };
  for (const feed of feeds) {
    const feedRoutes = routes.filter((r) => r.feed_id === feed.id);
    const modeMap = new Map<number, typeof feedRoutes>();
    for (const r of feedRoutes) {
      if (!modeMap.has(r.route_type)) modeMap.set(r.route_type, []);
      modeMap.get(r.route_type)!.push(r);
    }
    tree.agencies.push({
      id: feed.id,
      name: feed.name,
      modes: [...modeMap.entries()].map(([type, rs]) => ({
        type,
        label: MODE_LABELS[type] ?? `Mode ${type}`,
        routes: rs.map((r) => ({
          id: r.route_id,
          shortName: r.short_name,
          longName: r.long_name,
        })),
      })),
    });
  }

  const meta = await db<Array<{ rt_updated_at: Date | null }>>`
    SELECT rt_updated_at FROM feed_meta ORDER BY rt_updated_at DESC NULLS LAST LIMIT 1
  `;
  const rtUpdated = meta[0]?.rt_updated_at?.toISOString() ?? null;

  return { tree, rtUpdated };
}
