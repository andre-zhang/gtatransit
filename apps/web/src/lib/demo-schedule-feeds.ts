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

export function hasDemoScheduleFeed(feedId: string): feedId is DemoScheduleFeed {
  return (DEMO_SCHEDULE_FEEDS as readonly string[]).includes(feedId);
}
