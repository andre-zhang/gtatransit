import { MetaBar } from "@/components/MetaBar";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { RunViewClient } from "@/components/RunViewClient";
import { cleanHeadsign } from "@/lib/headsign";
import { getPageMeta } from "@/lib/page-meta";
import { getDemoRun } from "@/lib/demo-run";
import { serverBaseUrl } from "@/lib/server-base-url";

async function load(feedId: string, vehicleId: string) {
  const base = await serverBaseUrl();
  const res = await fetch(
    `${base}/api/runs/${feedId}/${encodeURIComponent(vehicleId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json();
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ feedId: string; vehicleId: string }>;
}) {
  const { feedId, vehicleId } = await params;
  const { demo, rtUpdated } = await getPageMeta();
  const data = demo
    ? await getDemoRun(feedId, vehicleId)
    : await load(feedId, vehicleId);

  if (!data) {
    return (
      <PageShell rtUpdated={rtUpdated} demo={demo}>
        <PageHeader title="Vehicle" />
        <RunViewClient feedId={feedId} vehicleId={vehicleId} initial={null} />
      </PageShell>
    );
  }

  const { vehicle, trip, route } = data as {
    vehicle: { id: string; label: string; delayMin: number | null };
    trip: { trip_id: string; headsign: string | null; route_id?: string } | null;
    route: {
      short_name: string | null;
      long_name: string | null;
      color: string;
    } | null;
  };

  const headsign = cleanHeadsign(
    trip?.headsign ?? route?.long_name ?? route?.short_name,
  ) || "Vehicle";
  const routeId = trip?.route_id ?? route?.short_name;
  const routeLabel = route?.short_name ?? routeId ?? "?";
  const routeHref = routeId
    ? `/route/${feedId}/${encodeURIComponent(routeId)}`
    : undefined;
  const tripHref = trip?.trip_id
    ? `/trip/${feedId}/${encodeURIComponent(trip.trip_id)}`
    : undefined;
  const currentStop = (data as { currentStop?: { groupId?: string } | null }).currentStop;
  const stopHref = currentStop?.groupId ? `/stop/${currentStop.groupId}` : undefined;

  return (
    <PageShell rtUpdated={rtUpdated} demo={demo}>
      <PageHeader
        title={headsign}
        subtitle={`Vehicle #${vehicle.id}`}
        routeBadge={
          routeLabel
            ? {
                shortName: routeLabel,
                color: route?.color ?? "#007934",
                href: routeHref,
              }
            : undefined
        }
      />
      <MetaBar
        items={[
          ...(stopHref ? [{ label: "Stop board", href: stopHref }] : []),
          ...(tripHref ? [{ label: "Trip", href: tripHref }] : []),
          ...(routeHref ? [{ label: "Route", href: routeHref }] : []),
        ]}
      />
      <RunViewClient feedId={feedId} vehicleId={vehicleId} initial={data} />
    </PageShell>
  );
}
