import { NextResponse } from "next/server";

/** Short CDN cache for read-heavy JSON APIs (dedupes concurrent map/board polls). */
export function jsonWithCache(data: unknown, maxAgeSec: number) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": `public, s-maxage=${maxAgeSec}, stale-while-revalidate=${maxAgeSec * 2}`,
    },
  });
}

export function cachedJsonBody(body: string, maxAgeSec: number) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, s-maxage=${maxAgeSec}, stale-while-revalidate=${maxAgeSec * 2}`,
    },
  });
}
