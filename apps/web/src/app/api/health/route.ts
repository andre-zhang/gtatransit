import { NextResponse } from "next/server";
import { useDemoFixtures } from "@/lib/demo-mode";
import { ensureDemoAssets, loadDemoAssets } from "@/lib/demo-assets";
import {
  getGoRtStatus,
  normalizeMetrolinxKey,
  refreshRtCache,
} from "@/lib/rt-cache";
import { GO_RT_API } from "@gta/gtfs-rt";

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

  let metrolinxProbe: { stopApi?: number; gtfsRt?: number } | null = null;
  const key = normalizeMetrolinxKey(process.env.METROLINX_API_KEY);
  if (key && goRt.lastError?.includes("401")) {
    const headers = { "Ocp-Apim-Subscription-Key": key };
    try {
      const [stopRes, gtfsRes] = await Promise.all([
        fetch(`${GO_RT_API.base}/api/V1/Stop/NextService/UN`, { headers }),
        fetch(`${GO_RT_API.base}/${GO_RT_API.tripUpdates}`, { headers }),
      ]);
      metrolinxProbe = { stopApi: stopRes.status, gtfsRt: gtfsRes.status };
    } catch {
      /* ignore probe errors */
    }
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
