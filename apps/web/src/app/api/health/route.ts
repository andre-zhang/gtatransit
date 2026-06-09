import { NextResponse } from "next/server";
import { useDemoFixtures } from "@/lib/demo-mode";
import { ensureDemoAssets, loadDemoAssets } from "@/lib/demo-assets";
import { getGoRtStatus, refreshRtCache } from "@/lib/rt-cache";

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

  return NextResponse.json({
    demoMode: demo,
    demoModeEnv: process.env.DEMO_MODE ?? null,
    vercel: Boolean(process.env.VERCEL),
    agencies,
    stops,
    fixturesError,
    goRt,
  });
}
