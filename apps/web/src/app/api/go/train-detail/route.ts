import { NextRequest, NextResponse } from "next/server";
import { fetchGoTrainDetail } from "@/lib/go-metrolinx-rest";
import { normalizeMetrolinxKey } from "@/lib/rt-cache";

export { dynamic, maxDuration } from "@/lib/api-config";

export async function GET(req: NextRequest) {
  const tripId = req.nextUrl.searchParams.get("tripId")?.trim();
  if (!tripId) {
    return NextResponse.json({ error: "missing_trip_id" }, { status: 400 });
  }

  const apiKey = normalizeMetrolinxKey(process.env.METROLINX_API_KEY);
  if (!apiKey) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const detail = await fetchGoTrainDetail(tripId, apiKey);
  if (!detail) {
    return NextResponse.json({ cars: null, carsLabel: null, occupancyPercent: null });
  }

  return NextResponse.json(detail);
}
