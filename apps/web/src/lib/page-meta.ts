import { getFilterTree } from "@/lib/filters-server";
import { useDemoFixtures } from "@/lib/demo-mode";
import { readDemoJsonFile } from "@/lib/demo-read";
import { getRtLastUpdatedIso } from "@/lib/rt-cache";

export async function getPageMeta(): Promise<{
  demo: boolean;
  rtUpdated: string | null;
}> {
  const demo = await useDemoFixtures();
  let rtUpdated: string | null = null;

  if (demo) {
    try {
      const core = await readDemoJsonFile<{ rtUpdated?: string }>("fixtures.json");
      rtUpdated = getRtLastUpdatedIso() ?? core.rtUpdated ?? null;
    } catch {
      rtUpdated = getRtLastUpdatedIso();
    }
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
