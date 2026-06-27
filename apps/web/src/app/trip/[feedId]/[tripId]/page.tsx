import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DetailLoading } from "@/components/DetailLoading";
import { MetaBar } from "@/components/MetaBar";
import { PageEmpty } from "@/components/PageEmpty";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { ServiceViewClient } from "@/components/ServiceViewClient";
import { VehicleLink } from "@/components/VehicleLink";
import { cleanHeadsign } from "@/lib/headsign";
import { getDemoServiceView } from "@/lib/demo-service-view";
import { displayRouteShort } from "@/lib/go-rail";
import { routePageHref, runPageHref } from "@/lib/detail-href";
import { getPageMeta } from "@/lib/page-meta";
import { stopBoardHref } from "@/lib/stop-group-href";
import { serverBaseUrl } from "@/lib/server-base-url";
import type { ServiceViewData } from "@/lib/demo-service-view";

async function load(
  feedId: string,
  tripId: string,
  opts?: { fromStop?: string; scheduleTrip?: string },
) {
  const params = new URLSearchParams({ view: "service" });
  if (opts?.fromStop) params.set("fromStop", opts.fromStop);
  if (opts?.scheduleTrip && opts.scheduleTrip !== tripId) {
    params.set("scheduleTrip", opts.scheduleTrip);
  }
  const base = await serverBaseUrl();
  const res = await fetch(
    `${base}/api/trips/${feedId}/${encodeURIComponent(tripId)}?${params}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json() as Promise<ServiceViewData>;
}

async function TripPageContent({
  feedId,
  tripId,
  demo,
  tripOpts,
}: {
  feedId: string;
  tripId: string;
  demo: boolean;
  tripOpts: { fromStop?: string; scheduleTrip?: string };
}) {
  const data = demo
    ? await getDemoServiceView(feedId, { tripId, ...tripOpts })
    : await load(feedId, tripId, tripOpts);

  if (
    data?.vehicle?.id &&
    data.vehicle.lat != null &&
    data.vehicle.lon != null &&
    !data.vehicle.id.startsWith("b:")
  ) {
    redirect(runPageHref(feedId, data.vehicle.id));
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Trip unavailable" />
        <PageEmpty
          title="Could not load this trip"
          hint="It may have ended or is not in today's schedule."
        />
      </>
    );
  }

  const title = cleanHeadsign(data.trip?.headsign) || "Trip";
  const routeHref = data.route ? routePageHref(feedId, data.trip?.route_id ?? data.route.short_name ?? "") : undefined;
  const stopHref =
    tripOpts.fromStop != null ? await stopBoardHref(feedId, tripOpts.fromStop) : null;

  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          data.vehicle ? (
            <VehicleLink
              feedId={feedId}
              vehicleId={data.vehicle.id}
              label={data.vehicle.label}
              className="text-sm font-semibold text-white/90 hover:text-white"
            />
          ) : undefined
        }
        routeBadge={
          data.route
            ? {
                shortName: displayRouteShort(data.route.short_name ?? "?"),
                color: data.route.color,
                href: routeHref,
              }
            : undefined
        }
      />
      <MetaBar
        items={[
          ...(stopHref ? [{ label: "Stop board", href: stopHref }] : []),
          ...(routeHref && data.route?.short_name
            ? [{ label: data.route.short_name, href: routeHref }]
            : []),
        ]}
      />
      <ServiceViewClient feedId={feedId} tripId={tripId} tripQuery={tripOpts} initial={data} />
    </>
  );
}

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ feedId: string; tripId: string }>;
  searchParams: Promise<{ fromStop?: string; scheduleTrip?: string }>;
}) {
  const { feedId, tripId } = await params;
  const sp = await searchParams;
  const { demo, rtUpdated } = await getPageMeta();
  const tripOpts = {
    fromStop: sp.fromStop,
    scheduleTrip: sp.scheduleTrip,
  };

  return (
    <PageShell rtUpdated={rtUpdated} demo={demo}>
      <Suspense fallback={<DetailLoading message="Loading…" />}>
        <TripPageContent
          feedId={feedId}
          tripId={tripId}
          demo={demo}
          tripOpts={tripOpts}
        />
      </Suspense>
    </PageShell>
  );
}
