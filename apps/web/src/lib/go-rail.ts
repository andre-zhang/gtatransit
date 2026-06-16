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
