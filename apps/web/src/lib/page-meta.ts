import { getSql } from "@/lib/db";
import { useDemoFixtures } from "@/lib/demo-mode";
import { readDemoJsonFile } from "@/lib/demo-read";
import { getRtLastUpdatedIso } from "@/lib/rt-cache";

let dbRtUpdated: { at: number; iso: string | null } | null = null;
const RT_META_TTL_MS = 15_000;

async function dbRtUpdatedIso(): Promise<string | null> {
  if (dbRtUpdated && Date.now() - dbRtUpdated.at < RT_META_TTL_MS) {
    return dbRtUpdated.iso;
  }
  try {
    const db = getSql();
    const meta = await db<Array<{ rt_updated_at: Date | null }>>`
      SELECT rt_updated_at FROM feed_meta ORDER BY rt_updated_at DESC NULLS LAST LIMIT 1
    `;
    const iso = meta[0]?.rt_updated_at?.toISOString() ?? null;
    dbRtUpdated = { at: Date.now(), iso };
    return iso;
  } catch {
    return null;
  }
}

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
    rtUpdated = getRtLastUpdatedIso() ?? (await dbRtUpdatedIso());
  }

  const updatedLabel = rtUpdated
    ? `${Math.max(0, Math.round((Date.now() - new Date(rtUpdated).getTime()) / 1000))}s ago`
    : null;

  return { demo, rtUpdated: updatedLabel };
}
