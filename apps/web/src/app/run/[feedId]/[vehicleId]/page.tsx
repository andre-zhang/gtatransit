import { Suspense } from "react";
import { DetailLoading } from "@/components/DetailLoading";
import { MetaBar } from "@/components/MetaBar";
import { PageEmpty } from "@/components/PageEmpty";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { RunViewClient } from "@/components/RunViewClient";
import { VehicleLink } from "@/components/VehicleLink";
import { cleanHeadsign } from "@/lib/headsign";
import { getDemoRun } from "@/lib/demo-run";
import { routePageHref, tripPageHref } from "@/lib/detail-href";
import { getPageMeta } from "@/lib/page-meta";
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

async function RunPageContent({
  feedId,
  vehicleId,
  demo,
}: {
  feedId: string;
  vehicleId: string;
  demo: boolean;
}) {
  const data = demo ? await getDemoRun(feedId, vehicleId) : await load(feedId, vehicleId);

  if (!data) {
    return (
      <>
        <PageHeader title="Vehicle" />
        <RunViewClient feedId={feedId} vehicleId={vehicleId} initial={null} />
      </>
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

  const headsign =
    cleanHeadsign(trip?.headsign ?? route?.long_name ?? route?.short_name) || "Vehicle";
  const routeId = trip?.route_id ?? route?.short_name;
  const routeLabel = route?.short_name ?? routeId;
  const routeHref = routeId ? routePageHref(feedId, routeId) : undefined;
  const tripHref = trip?.trip_id ? tripPageHref(feedId, trip.trip_id) : undefined;
  const tripLabel = cleanHeadsign(trip?.headsign) || "Trip";
  const currentStop = (data as { currentStop?: { groupId?: string } | null }).currentStop;
  const stopHref = currentStop?.groupId ? `/stop/${currentStop.groupId}` : undefined;

  return (
    <>
      <PageHeader
        title={headsign}
        subtitle={
          <VehicleLink
            feedId={feedId}
            vehicleId={vehicle.id}
            label={vehicle.label}
            className="text-sm font-semibold text-white/90 hover:text-white"
          />
        }
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
          ...(tripHref ? [{ label: tripLabel, href: tripHref }] : []),
          ...(routeHref && routeLabel
            ? [{ label: routeLabel, href: routeHref }]
            : []),
        ]}
      />
      <RunViewClient feedId={feedId} vehicleId={vehicleId} initial={data} />
    </>
  );
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ feedId: string; vehicleId: string }>;
}) {
  const { feedId, vehicleId } = await params;
  const { demo, rtUpdated } = await getPageMeta();

  return (
    <PageShell rtUpdated={rtUpdated} demo={demo}>
      <Suspense fallback={<DetailLoading message="Loading vehicle…" />}>
        <RunPageContent feedId={feedId} vehicleId={vehicleId} demo={demo} />
      </Suspense>
    </PageShell>
  );
}
