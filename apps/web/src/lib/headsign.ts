import { goLineCode } from "./go-rail";

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

function stripRoutePrefix(cleaned: string, routeKey: string): string | null {
  const escaped = routeKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}[A-Za-z]?\\s*-\\s*`, "i");
  if (!re.test(cleaned)) return null;
  const stripped = cleaned.replace(re, "").trim();
  return stripped || null;
}

/** Destination column for departure boards — drop redundant route/line prefixes. */
export function boardDestination(
  feedId: string,
  routeShort: string | null | undefined,
  headsign: string | null | undefined,
): string {
  const cleaned = cleanHeadsign(headsign);
  if (!cleaned) return "";

  const short = routeShort?.trim();
  if (!short) return cleaned;

  if (feedId === "ttc") {
    const ttc = cleaned.match(/^(?:North|South|East|West)\s*-\s*\d+[A-Za-z]?\s+(.+)$/i);
    if (ttc?.[1]) return ttc[1].trim();
  }

  if (feedId === "go" || feedId === "up") {
    const line = goLineCode(short) ?? short;
    const stripped = stripRoutePrefix(cleaned, line);
    if (stripped) return stripped;
  }

  const stripped = stripRoutePrefix(cleaned, short);
  if (stripped) return stripped;

  return cleaned;
}
