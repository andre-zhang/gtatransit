/** Human-readable early/late label (e.g. "early 10 mins", "late 5 mins"). */
export function formatDelayLabel(delayMin: number | null | undefined): string | null {
  if (delayMin == null || delayMin === 0) return null;
  const n = Math.abs(delayMin);
  const unit = n === 1 ? "min" : "mins";
  return delayMin > 0 ? `late ${n} ${unit}` : `early ${n} ${unit}`;
}
