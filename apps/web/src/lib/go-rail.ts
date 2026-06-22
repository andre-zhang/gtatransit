/** Extract GO/UP line code from route id, headsign, or short name. */
export function goLineCode(source: string | null | undefined): string | null {
  if (!source) return null;
  const s = source.trim().toUpperCase();
  const fromRouteId = s.match(/(?:^|\d)-([A-Z]{2,3})$/);
  if (fromRouteId) return fromRouteId[1]!;
  const fromHeadsign = s.match(/^([A-Z]{2,3})\s*-/);
  if (fromHeadsign) return fromHeadsign[1]!;
  if (/^[A-Z]{2,3}$/.test(s)) return s;
  return null;
}

/** GO/UP rail lines use 2–3 letter codes (LE, LW, UP); buses use numeric route names. */
export function isGoRailLine(routeShort: string | null | undefined): boolean {
  const code = goLineCode(routeShort);
  if (!code) return false;
  if (code === "UP") return true;
  return /^[A-Z]{2,3}$/.test(code);
}

export function isMetrolinxRailFeed(
  feedId: string,
  routeShort: string | null | undefined,
): boolean {
  return (feedId === "go" || feedId === "up") && isGoRailLine(routeShort);
}

/** GO rail trips embed a line code (LW-1023); bus trips use numeric routes (94-94511). */
export function isGoRailTripId(tripId: string | null | undefined): boolean {
  if (!tripId) return false;
  const m = tripId.match(/^\d{8}-([A-Z]{2,3})-/i);
  return m != null && isGoRailLine(m[1]);
}

/** Route badge label — strip Metrolinx “#” prefixes from RT ids. */
export function displayRouteShort(raw: string | null | undefined): string {
  if (!raw) return "?";
  const s = raw.trim().replace(/^#+/, "");
  const code = goLineCode(s);
  if (code && isGoRailLine(code)) return code;
  return s;
}
