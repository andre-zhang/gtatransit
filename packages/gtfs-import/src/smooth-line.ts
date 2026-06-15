/** Reduce vertices while preserving shape (uniform stride). */
export function decimateLine(coords: number[][], maxPoints: number): number[][] {
  if (coords.length <= maxPoints) return coords;
  const step = Math.max(1, Math.floor(coords.length / maxPoints));
  const out: number[][] = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]!);
  const last = coords[coords.length - 1]!;
  const tail = out[out.length - 1];
  if (tail && (tail[0] !== last[0] || tail[1] !== last[1])) out.push(last);
  return out;
}

function perpDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1);
  }
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}

/** Douglas–Peucker simplification (lon/lat degrees). */
export function simplifyLine(
  coords: number[][],
  tolerance = 0.00008,
): number[][] {
  if (coords.length <= 2) return coords;

  let maxDist = 0;
  let index = 0;
  const end = coords.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDistance(coords[i]!, coords[0]!, coords[end]!);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyLine(coords.slice(0, index + 1), tolerance);
    const right = simplifyLine(coords.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [coords[0]!, coords[end]!];
}

/** Smooth jagged GTFS shapes for map display (one-time at import). */
export function smoothRouteLine(coords: number[][], routeType: number): number[][] {
  if (coords.length < 3) return coords;
  const tol = routeType === 2 ? 0.00004 : routeType === 1 ? 0.00005 : 0.00007;
  let simplified = simplifyLine(coords, tol);
  const maxPts = routeType === 2 ? 2500 : routeType === 3 ? 400 : 1200;
  if (simplified.length > maxPts) {
    simplified = decimateLine(simplified, maxPts);
  }
  return simplified;
}
