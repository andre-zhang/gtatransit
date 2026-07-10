import { getSql } from "@/lib/db";
import { isDemoOnlyScheduleFeed } from "@/lib/demo-schedule-feeds";
import { useDemoFixtures } from "@/lib/demo-mode";

export async function stopGroupIdFor(
  feedId: string,
  stopId: string,
): Promise<string | null> {
  if ((await useDemoFixtures()) || isDemoOnlyScheduleFeed(feedId)) {
    // Legacy "feedId-stopId" ids are resolved to the real group by the stop
    // board itself (resolveStopGroupId), so we can link without loading the
    // multi-MB stop grouping assets into this lambda.
    return `${feedId}-${stopId}`;
  }

  const db = getSql();
  const rows = await db<Array<{ group_id: string }>>`
    SELECT group_id FROM stop_group_members
    WHERE feed_id = ${feedId} AND stop_id = ${stopId}
    LIMIT 1
  `;
  return rows[0]?.group_id ?? null;
}

export async function stopBoardHref(
  feedId: string,
  stopId: string,
): Promise<string | null> {
  const groupId = await stopGroupIdFor(feedId, stopId);
  return groupId ? `/stop/${groupId}` : null;
}
