/** GO uses short station codes (UN) and numeric platform ids (02300) interchangeably in RT. */
const UNION_ALIASES = new Set(["UN", "02300", "002300"]);

export function expandGoStopId(stopId: string): string[] {
  const ids = new Set<string>([stopId]);
  if (UNION_ALIASES.has(stopId)) {
    for (const id of UNION_ALIASES) ids.add(id);
  }
  return [...ids];
}

/** Prefer station code keys used in go-schedules.json (UN over platform ids). */
export function goScheduleLookupKeys(stopId: string): string[] {
  const expanded = expandGoStopId(stopId);
  if (expanded.length > 1) {
    return ["UN", ...expanded.filter((id) => id !== "UN")];
  }
  return expanded;
}

export function goStopIdsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const aliases = expandGoStopId(a);
  return aliases.includes(b);
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
