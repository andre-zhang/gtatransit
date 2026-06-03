import { NextRequest, NextResponse } from "next/server";
import { refreshRtCache } from "@/lib/rt-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Keeps rt_vehicles fresh on Vercel when using Neon (optional CRON_SECRET). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await refreshRtCache(true);
  return NextResponse.json({ ok: true });
}
