/** Max |delay| shown in UI — beyond this the schedule/RT match is likely wrong. */
export const MAX_DISPLAY_DELAY_MIN = 120;

/** Human-readable early/late label (e.g. "early 10 mins", "late 5 mins"). */
export function formatDelayLabel(delayMin: number | null | undefined): string | null {
  if (delayMin == null || delayMin === 0) return null;
  const n = Math.abs(delayMin);
  const unit = n === 1 ? "min" : "mins";
  return delayMin > 0 ? `late ${n} ${unit}` : `early ${n} ${unit}`;
}

export function isPlausibleDelayMin(delayMin: number | null | undefined): boolean {
  return delayMin != null && Math.abs(delayMin) <= MAX_DISPLAY_DELAY_MIN;
}

export function displayDelayMin(
  delaySec: number | null | undefined,
): number | undefined {
  if (delaySec == null) return undefined;
  const min = Math.round(delaySec / 60);
  return isPlausibleDelayMin(min) ? min : undefined;
}
