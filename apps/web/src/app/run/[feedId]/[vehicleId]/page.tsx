import { Suspense } from "react";
import { DetailLoading } from "@/components/DetailLoading";
import { MetaBar } from "@/components/MetaBar";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { ServiceViewClient } from "@/components/ServiceViewClient";
import { VehicleLink } from "@/components/VehicleLink";
import { cleanHeadsign } from "@/lib/headsign";
import { type ServiceViewData } from "@/lib/demo-service-view";
import { displayRouteShort } from "@/lib/go-rail";
import { routePageHref } from "@/lib/detail-href";
import { getPageMeta } from "@/lib/page-meta";
import { serverBaseUrl } from "@/lib/server-base-url";

async function load(feedId: string, vehicleId: string) {
  const base = await serverBaseUrl();
  const res = await fetch(
    `${base}/api/runs/${feedId}/${encodeURIComponent(vehicleId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json() as Promise<ServiceViewData>;
}

async function RunPageContent({
  feedId,
  vehicleId,
}: {
  feedId: string;
  vehicleId: string;
}) {
  // Always go through the API route so the CDN cache is shared with client refreshes.
  const data = await load(feedId, vehicleId);

  const headsign =
    cleanHeadsign(data?.trip?.headsign ?? data?.route?.long_name ?? data?.route?.short_name) ||
    "In service";
  const routeId = data?.trip?.route_id ?? data?.route?.short_name;
  const routeLabel = data?.route?.short_name
    ? displayRouteShort(data.route.short_name)
    : routeId
      ? displayRouteShort(routeId)
      : undefined;
  const routeHref = routeId ? routePageHref(feedId, routeId) : undefined;
  const stopHref = data?.currentStop?.groupId
    ? `/stop/${data.currentStop.groupId}`
    : undefined;

  return (
    <>
      <PageHeader
        title={headsign}
        subtitle={
          data?.vehicle ? (
            <VehicleLink
              feedId={feedId}
              vehicleId={data.vehicle.id}
              label={data.vehicle.label}
              className="text-sm font-semibold text-white/90 hover:text-white"
            />
          ) : undefined
        }
        routeBadge={
          routeLabel
            ? {
                shortName: routeLabel,
                color: data?.route?.color ?? "#007934",
                href: routeHref,
              }
            : undefined
        }
      />
      {data && (
        <MetaBar
          items={[
            ...(stopHref ? [{ label: "Stop board", href: stopHref }] : []),
            ...(routeHref && routeLabel
              ? [{ label: routeLabel, href: routeHref }]
              : []),
          ]}
        />
      )}
      <ServiceViewClient feedId={feedId} vehicleId={vehicleId} initial={data} />
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
      <Suspense fallback={<DetailLoading message="Loading…" />}>
        <RunPageContent feedId={feedId} vehicleId={vehicleId} />
      </Suspense>
    </PageShell>
  );
}
