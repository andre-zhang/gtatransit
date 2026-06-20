import type { DepartureRowOut } from "./departures";

type BoardPayload = { name: string; rows: DepartureRowOut[] };

const cache = new Map<string, { at: number; data: BoardPayload }>();
const TTL_MS = 25_000;

export function getCachedStopBoard(groupId: string, quick: boolean): BoardPayload | null {
  const hit = cache.get(`${groupId}:${quick ? "q" : "l"}`);
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  return hit.data;
}

export function setCachedStopBoard(groupId: string, quick: boolean, data: BoardPayload) {
  cache.set(`${groupId}:${quick ? "q" : "l"}`, { at: Date.now(), data });
}
