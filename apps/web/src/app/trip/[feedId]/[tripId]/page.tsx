import { Suspense } from "react";
import { DetailLoading } from "@/components/DetailLoading";
import { MetaBar } from "@/components/MetaBar";
import { PageEmpty } from "@/components/PageEmpty";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";
import { StopTimeline } from "@/components/StopTimeline";
import { VehicleLink } from "@/components/VehicleLink";
import { cleanHeadsign } from "@/lib/headsign";
import { routePageHref, runPageHref } from "@/lib/detail-href";
import { loadDemoTripPayload } from "@/lib/load-demo-trip";
import { getPageMeta } from "@/lib/page-meta";
import { stopBoardHref } from "@/lib/stop-group-href";
import { serverBaseUrl } from "@/lib/server-base-url";

type Stop = {
  stopId: string;
  name: string;
  sequence: number;
  scheduled: string;
  predicted?: string;
  delayMin?: number;
  platform?: string;
  groupId?: string;
  passed?: boolean;
};

type TripPayload = {
  stops: Stop[];
  vehicleId?: string;
  headsign?: string | null;
  route?: {
    routeId: string;
    shortName: string;
    color: string;
  } | null;
};

async function load(
  feedId: string,
  tripId: string,
  opts?: { fromStop?: string; scheduleTrip?: string },
) {
  const params = new URLSearchParams();
  if (opts?.fromStop) params.set("fromStop", opts.fromStop);
  if (opts?.scheduleTrip && opts.scheduleTrip !== tripId) {
    params.set("scheduleTrip", opts.scheduleTrip);
  }
  const qs = params.toString() ? `?${params}` : "";
  const base = await serverBaseUrl();
  const res = await fetch(
    `${base}/api/trips/${feedId}/${encodeURIComponent(tripId)}${qs}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json() as Promise<TripPayload>;
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
  let data: TripPayload | null = null;
  if (demo) {
    try {
      data = await loadDemoTripPayload(feedId, tripId, tripOpts);
    } catch {
      data = null;
    }
  } else {
    data = await load(feedId, tripId, tripOpts);
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

  const title = cleanHeadsign(data.headsign) || "Trip";
  const routeHref = data.route ? routePageHref(feedId, data.route.routeId) : undefined;
  const stopHref =
    tripOpts.fromStop != null ? await stopBoardHref(feedId, tripOpts.fromStop) : null;
  const metaItems = [
    ...(stopHref ? [{ label: "Stop board", href: stopHref }] : []),
    ...(data.vehicleId
      ? [{ label: `#${data.vehicleId}`, href: runPageHref(feedId, data.vehicleId) }]
      : []),
    ...(routeHref && data.route
      ? [{ label: data.route.shortName, href: routeHref }]
      : []),
  ];

  const header = (
    <PageHeader
      title={title}
      subtitle={
        data.vehicleId ? (
          <VehicleLink
            feedId={feedId}
            vehicleId={data.vehicleId}
            className="text-sm font-semibold text-white/90 hover:text-white"
          />
        ) : undefined
      }
      routeBadge={
        data.route
          ? {
              shortName: data.route.shortName,
              color: data.route.color,
              href: routeHref,
            }
          : undefined
      }
    />
  );

  if (!data.stops.length) {
    return (
      <>
        {header}
        <MetaBar items={metaItems} />
        <PageEmpty title="No upcoming stops" />
      </>
    );
  }

  return (
    <>
      {header}
      <MetaBar items={metaItems} />
      <Section title="Stops">
        <StopTimeline
          stops={data.stops.map((s) => ({
            stop_id: s.stopId,
            name: s.name,
            scheduled: s.scheduled,
            predicted: s.predicted,
            delayMin: s.delayMin,
            groupId: s.groupId,
            passed: s.passed,
          }))}
        />
      </Section>
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
      <Suspense fallback={<DetailLoading message="Loading trip…" />}>
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
