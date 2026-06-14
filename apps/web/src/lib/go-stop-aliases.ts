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

/** GO live trip ids rotate the service-date prefix; suffix is stable within a day. */
export function goTripSuffix(tripId: string): string {
  const m = tripId.match(/^\d{8}-(.+)$/);
  return m ? m[1]! : tripId;
}

export function goTripsMatch(scheduleTripId: string, liveTripId: string): boolean {
  if (scheduleTripId === liveTripId) return true;
  return goTripSuffix(scheduleTripId) === goTripSuffix(liveTripId);
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

/** Turn RT platform / assigned stop id into a short platform label when possible. */
export function formatGoPlatform(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;

  const labeled = s.match(/(?:track|bay|plat(?:form)?)\s*[#:]?\s*(\d{1,2})/i);
  if (labeled?.[1]) return labeled[1];

  if (s.length <= 3 && !/^\d{4,}$/.test(s)) return s;

  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && n > 0 && n < 100) return String(n);

  if (/^0?23(\d{2})$/.test(s)) {
    const plat = parseInt(s.slice(-2), 10);
    if (plat > 0 && plat < 100) return String(plat);
  }

  if (/^0\d{3,4}$/.test(s)) {
    const tail = parseInt(s.slice(-2), 10);
    if (tail > 0 && tail < 100) return String(tail);
  }

  return s.length <= 8 ? s : undefined;
}
