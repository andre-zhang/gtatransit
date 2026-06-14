import { Nav } from "@/components/Nav";
import { MapView } from "@/components/MapView";
import { getFilterTree } from "@/lib/filters-server";
import { useDemoFixtures } from "@/lib/demo";
import { getRtLastUpdatedIso, refreshRtCache } from "@/lib/rt-cache";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const demo = await useDemoFixtures();
  let tree: Awaited<ReturnType<typeof getFilterTree>>["tree"] = { agencies: [] };
  let rtUpdated: string | null = null;

  if (demo) {
    const { ensureDemoAssets, getDemoCore } = await import("@/lib/demo");
    await ensureDemoAssets();
    const core = getDemoCore();
    tree = core.filterTree as typeof tree;
    await refreshRtCache();
    rtUpdated = getRtLastUpdatedIso() ?? core.rtUpdated;
  } else {
    try {
      const data = await getFilterTree();
      tree = data.tree;
      rtUpdated = data.rtUpdated;
    } catch {
      /* DB not ready */
    }
  }

  const updatedLabel = rtUpdated
    ? `${Math.max(0, Math.round((Date.now() - new Date(rtUpdated).getTime()) / 1000))}s ago`
    : null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Nav rtUpdated={updatedLabel} demo={demo} />
      <MapView filterTree={tree} rtUpdated={updatedLabel} demoMode={demo} />
    </div>
  );
}
