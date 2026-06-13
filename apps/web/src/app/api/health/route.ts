import { NextResponse } from "next/server";
import { useDemoFixtures } from "@/lib/demo-mode";
import { ensureDemoAssets, loadDemoAssets } from "@/lib/demo-assets";
import { getGoRtStatus, normalizeMetrolinxKey, refreshRtCache } from "@/lib/rt-cache";
import { probeMetrolinxKey } from "@/lib/go-metrolinx-rest";

export async function GET() {
  const demo = await useDemoFixtures();
  let agencies = 0;
  let stops = 0;
  let fixturesError: string | null = null;

  if (demo) {
    try {
      await ensureDemoAssets();
      const { core } = loadDemoAssets();
      agencies = core.filterTree.agencies.length;
      stops = Object.keys(core.stops).length;
    } catch (e) {
      fixturesError = e instanceof Error ? e.message : String(e);
    }
  }

  await refreshRtCache();
  const goRt = getGoRtStatus();

  let metrolinxProbe: Awaited<ReturnType<typeof probeMetrolinxKey>> | null = null;
  if (goRt.configured && !goRt.active) {
    const key = normalizeMetrolinxKey(process.env.METROLINX_API_KEY);
    if (key) metrolinxProbe = await probeMetrolinxKey(key);
  }

  return NextResponse.json({
    demoMode: demo,
    demoModeEnv: process.env.DEMO_MODE ?? null,
    vercel: Boolean(process.env.VERCEL),
    agencies,
    stops,
    fixturesError,
    goRt,
    metrolinxProbe,
  });
}
