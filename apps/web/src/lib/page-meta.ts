import { getFilterTree } from "@/lib/filters-server";
import { useDemoFixtures } from "@/lib/demo-mode";
import { getRtLastUpdatedIso } from "@/lib/rt-cache";

export async function getPageMeta(): Promise<{
  demo: boolean;
  rtUpdated: string | null;
}> {
  const demo = await useDemoFixtures();
  let rtUpdated: string | null = null;

  if (demo) {
    const { ensureDemoAssets, getDemoCore } = await import("@/lib/demo");
    await ensureDemoAssets();
    rtUpdated = getRtLastUpdatedIso() ?? getDemoCore().rtUpdated;
  } else {
    try {
      const data = await getFilterTree();
      rtUpdated = data.rtUpdated;
    } catch {
      /* DB not ready */
    }
  }

  const updatedLabel = rtUpdated
    ? `${Math.max(0, Math.round((Date.now() - new Date(rtUpdated).getTime()) / 1000))}s ago`
    : null;

  return { demo, rtUpdated: updatedLabel };
}
