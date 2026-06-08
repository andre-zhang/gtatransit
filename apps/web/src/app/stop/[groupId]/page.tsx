import { StopBoardClient } from "@/components/StopBoardClient";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import type { DepartureRow } from "@/components/DepartureTable";
import { ensureDemoAssets, getDemoCore } from "@/lib/demo";
import { useDemoFixtures } from "@/lib/demo-mode";
import { getStopSchedule } from "@/lib/demo-schedules";
import { resolveStopGroupId } from "@/lib/demo-stop-groups";
import {
  filterUpcomingDepartures,
  gtfsTimeToSec,
  type DepartureInput,
} from "@/lib/departures";
import { mergeRtIntoDeparture, refreshRtCache } from "@/lib/rt-cache";
import { serverBaseUrl } from "@/lib/server-base-url";

async function loadRemote(groupId: string) {
  const base = await serverBaseUrl();
  const res = await fetch(`${base}/api/stops/${groupId}/departures`, { cache: "no-store" });
  if (!res.ok) return { name: "Stop", rows: [] as DepartureRow[] };
  return res.json() as Promise<{ name: string; rows: DepartureRow[] }>;
}

async function loadDemo(groupId: string) {
  await ensureDemoAssets();
  const resolved = resolveStopGroupId(groupId);
  await refreshRtCache(true);
  const stop = getDemoCore().stops[resolved];
  if (!stop) return { name: "Stop", rows: [] as DepartureRow[] };

  const schedule = await getStopSchedule(resolved);
  const inputs: DepartureInput[] = schedule.map((r) => {
    const schedSec = gtfsTimeToSec(r.departureTime);
    const rt = mergeRtIntoDeparture(r.feedId, r.tripId, r.stopId, schedSec);
    return {
      tripId: r.tripId,
      feedId: r.feedId,
      routeId: r.routeId,
      routeShort: r.routeShort,
      routeColor: r.routeColor,
      destination: r.headsign,
      departureTime: r.departureTime,
      stopId: r.stopId,
      platform: r.feedId === "go" ? rt.platform : undefined,
      delaySec: rt.delaySec,
      predictedSec: rt.predictedSec,
      realtime: rt.realtime,
      vehicleId: rt.vehicleId,
    };
  });

  return { name: stop.name, rows: filterUpcomingDepartures(inputs) };
}

export default async function StopPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const demo = await useDemoFixtures();
  const { name, rows } = demo ? await loadDemo(groupId) : await loadRemote(groupId);
  const resolved = demo
    ? resolveStopGroupId(groupId)
    : groupId;

  return (
    <PageShell>
      <PageHeader title={name} />
      <StopBoardClient groupId={resolved} initialName={name} initialRows={rows} />
    </PageShell>
  );
}
