/** Minimum zoom to fetch/render each layer (MapLibre zoom levels). */
export const ZOOM_ROUTES = 10;
export const ZOOM_STOPS = 12;
export const ZOOM_ROUTE_DETAIL = 13;

export type Bbox = [west: number, south: number, east: number, north: number];

export function parseBbox(raw: string | null): Bbox | null {
  if (!raw) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [west, south, east, north] = parts;
  if (west >= east || south >= north) return null;
  return [west, south, east, north];
}

export function pointInBbox(lon: number, lat: number, bbox: Bbox, pad = 0): boolean {
  const [w, s, e, n] = bbox;
  return lon >= w - pad && lon <= e + pad && lat >= s - pad && lat <= n + pad;
}

/** True if any vertex falls inside bbox (with padding in degrees). */
export function lineTouchesBbox(
  coords: number[][],
  bbox: Bbox,
  padDeg = 0.02,
): boolean {
  for (const c of coords) {
    const lon = c[0];
    const lat = c[1];
    if (lon == null || lat == null) continue;
    if (pointInBbox(lon, lat, bbox, padDeg)) return true;
  }
  return false;
}

/** Reduce vertices for low zoom — keeps shape readable without huge payloads. */
export function decimateLine(coords: number[][], maxPoints: number): number[][] {
  if (coords.length <= maxPoints) return coords;
  const step = Math.max(1, Math.floor(coords.length / maxPoints));
  const out: number[][] = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  const last = coords[coords.length - 1];
  const tail = out[out.length - 1];
  if (tail && last && (tail[0] !== last[0] || tail[1] !== last[1])) out.push(last);
  return out;
}

export function maxPointsForZoom(zoom: number): number {
  if (zoom < 11) return 24;
  if (zoom < ZOOM_ROUTE_DETAIL) return 80;
  if (zoom < 15) return 200;
  return 2000;
}
