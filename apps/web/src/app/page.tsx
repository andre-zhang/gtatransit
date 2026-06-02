import { Nav } from "@/components/Nav";
import { MapView } from "@/components/MapView";
import { getFilterTree } from "@/lib/filters-server";
import { isDemoMode } from "@/lib/demo";

export default async function HomePage() {
  let tree: Awaited<ReturnType<typeof getFilterTree>>["tree"] = { agencies: [] };
  let rtUpdated: string | null = null;
  try {
    const data = await getFilterTree();
    tree = data.tree;
    rtUpdated = data.rtUpdated;
  } catch {
    /* DB not ready */
  }
  const updatedLabel = rtUpdated
    ? `${Math.max(0, Math.round((Date.now() - new Date(rtUpdated).getTime()) / 1000))}s ago`
    : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Nav rtUpdated={updatedLabel} />
      <MapView filterTree={tree} rtUpdated={updatedLabel} demoMode={isDemoMode()} />
    </div>
  );
}
