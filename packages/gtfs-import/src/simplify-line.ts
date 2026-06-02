/** Reduce polyline vertices for map display (bus routes). */
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
