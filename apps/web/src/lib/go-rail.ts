/** GO/UP rail lines use 2–3 letter codes (LE, LW, UP); buses use numeric route names. */
export function isGoRailLine(routeShort: string | null | undefined): boolean {
  if (!routeShort) return false;
  const s = routeShort.trim().toUpperCase();
  if (s === "UP") return true;
  if (!/^[A-Z]{2,3}$/.test(s)) return false;
  return !/^\d+$/.test(s);
}
