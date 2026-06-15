import { getSql } from "@/lib/db";
import { useDemoFixtures } from "@/lib/demo-mode";

export async function stopGroupIdFor(
  feedId: string,
  stopId: string,
): Promise<string | null> {
  if (await useDemoFixtures()) {
    const { resolveStopGroupForMember } = await import("./demo-stop-groups");
    return resolveStopGroupForMember(feedId, stopId);
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
