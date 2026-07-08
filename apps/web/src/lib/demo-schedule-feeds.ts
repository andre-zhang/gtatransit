/** Feeds with full schedule shards in public/demo (stop boards, trips, routes, vehicle view). */
export const DEMO_SCHEDULE_FEEDS = [
  "go",
  "up",
  "ttc",
  "miway",
  "brampton",
  "drt",
  "yrt",
] as const;

export type DemoScheduleFeed = (typeof DEMO_SCHEDULE_FEEDS)[number];

/** Regional feeds stored in demo shards only — not imported to Postgres yet. */
export const DEMO_ONLY_SCHEDULE_FEEDS = ["yrt", "brampton", "drt", "miway"] as const;

export function hasDemoScheduleFeed(feedId: string): feedId is DemoScheduleFeed {
  return (DEMO_SCHEDULE_FEEDS as readonly string[]).includes(feedId);
}

export function isDemoOnlyScheduleFeed(feedId: string): boolean {
  return (DEMO_ONLY_SCHEDULE_FEEDS as readonly string[]).includes(feedId);
}

/** Demo shards are the source of truth for these feeds even when Postgres is linked. */
export async function useDemoForFeed(feedId: string): Promise<boolean> {
  const { useDemoFixtures } = await import("./demo-mode");
  if (await useDemoFixtures()) return true;
  return isDemoOnlyScheduleFeed(feedId);
}

export async function stopUsesDemoScheduleBoard(
  members: Array<{ feedId: string; stopId: string }>,
): Promise<boolean> {
  const { useDemoFixtures } = await import("./demo-mode");
  if (await useDemoFixtures()) return true;
  return members.some((m) => isDemoOnlyScheduleFeed(m.feedId));
}
