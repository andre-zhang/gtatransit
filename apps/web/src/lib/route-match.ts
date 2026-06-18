/** GO route ids embed a service date prefix (e.g. 04260626-52 → 52). */
export function routeTail(routeId: string): string {
  const m = routeId.match(/^\d{8}-(.+)$/);
  return m ? m[1]! : routeId;
}

export function routeIdentityKeys(
  feedId: string,
  routeId: string,
  routeShort?: string | null,
): Set<string> {
  const keys = new Set<string>();
  if (routeId) {
    keys.add(routeId);
    keys.add(routeTail(routeId));
  }
  if (routeShort) keys.add(routeShort);
  return keys;
}

function isAmbiguousNumericKey(key: string): boolean {
  return /^\d{1,2}$/.test(key);
}

/** True when a live/RT route id refers to the same line as the page route. */
export function routesMatch(
  feedId: string,
  pageRouteId: string,
  pageShort: string | null | undefined,
  rtRouteId: string | undefined,
): boolean {
  if (!rtRouteId) return false;
  const pageKeys = routeIdentityKeys(feedId, pageRouteId, pageShort);
  const rtKeys = routeIdentityKeys(feedId, rtRouteId, routeTail(rtRouteId));
  for (const key of pageKeys) {
    if (!rtKeys.has(key)) continue;
    if (isAmbiguousNumericKey(key)) {
      const pageFull = pageRouteId === rtRouteId || pageShort === rtRouteId;
      const pageTail = routeTail(pageRouteId) === routeTail(rtRouteId);
      if (!pageFull && !pageTail) continue;
    }
    return true;
  }
  return false;
}
