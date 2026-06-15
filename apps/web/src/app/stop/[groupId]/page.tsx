import { StopBoardClient } from "@/components/StopBoardClient";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import type { DepartureRow } from "@/components/DepartureTable";
import { ensureDemoAssets, getDemoCore } from "@/lib/demo";
import { useDemoFixtures } from "@/lib/demo-mode";
import { resolveStopGroupId } from "@/lib/demo-stop-groups";
import { getPageMeta } from "@/lib/page-meta";
import { buildDemoStopDepartures } from "@/lib/stop-departures";
import { serverBaseUrl } from "@/lib/server-base-url";

async function loadRemote(groupId: string) {
  const base = await serverBaseUrl();
  const res = await fetch(`${base}/api/stops/${groupId}/departures`, { cache: "no-store" });
  if (!res.ok) return { name: "Stop", rows: [] as DepartureRow[] };
  return res.json() as Promise<{ name: string; rows: DepartureRow[] }>;
}

export default async function StopPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { demo, rtUpdated } = await getPageMeta();
  let name = "Stop";
  let rows: DepartureRow[] = [];
  let resolved = groupId;

  if (demo) {
    await ensureDemoAssets();
    resolved = resolveStopGroupId(groupId);
    const stop = getDemoCore().stops[resolved];
    if (stop) {
      const board = await buildDemoStopDepartures(resolved, stop);
      name = board.name;
      rows = board.rows;
    }
  } else {
    const data = await loadRemote(groupId);
    name = data.name;
    rows = data.rows;
  }

  return (
    <PageShell rtUpdated={rtUpdated} demo={demo}>
      <PageHeader title={name} />
      <StopBoardClient groupId={groupId} initialName={name} initialRows={rows} />
    </PageShell>
  );
}
