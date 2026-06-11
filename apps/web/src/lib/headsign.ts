/** Strip fixture/RT wrapping quotes from headsign strings. */
export function cleanHeadsign(value: string | null | undefined): string {
  if (!value) return "";
  let s = value.trim();
  while (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}
