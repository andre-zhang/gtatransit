import { NextRequest, NextResponse } from "next/server";
import { useDemoForFeed } from "@/lib/demo-schedule-feeds";
import { resolveVehicleBlock } from "@/lib/demo-trip-meta";
import { resolveDemoTrip } from "@/lib/demo-trip-resolve";

export { dynamic, maxDuration } from "@/lib/api-config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ feedId: string; vehicleId: string }> },
) {
  const { feedId } = await params;
  if (!(await useDemoForFeed(feedId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const liveTripId = req.nextUrl.searchParams.get("tripId") ?? undefined;
  const scheduleTripParam = req.nextUrl.searchParams.get("scheduleTrip") ?? undefined;

  let scheduleTripId = scheduleTripParam;
  if (liveTripId && !scheduleTripId) {
    const resolved = await resolveDemoTrip(feedId, liveTripId);
    scheduleTripId = resolved.scheduleTripId;
  }

  const block = await resolveVehicleBlock(feedId, liveTripId, scheduleTripId);
  return NextResponse.json(block);
}
