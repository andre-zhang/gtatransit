/** GO uses short station codes (UN) and numeric platform ids (02300) interchangeably in RT. */
const UNION_ALIASES = new Set(["UN", "02300", "002300"]);

export function expandGoStopId(stopId: string): string[] {
  const ids = new Set<string>([stopId]);
  if (UNION_ALIASES.has(stopId)) {
    for (const id of UNION_ALIASES) ids.add(id);
  }
  return [...ids];
}

export function resolveGoRtStopIds(
  stopId: string,
  members: Array<{ feedId: string; stopId: string }>,
): string[] {
  const ids = new Set<string>();
  for (const id of expandGoStopId(stopId)) ids.add(id);
  for (const m of members) {
    if (m.feedId !== "go") continue;
    for (const id of expandGoStopId(m.stopId)) ids.add(id);
  }
  return [...ids];
}
