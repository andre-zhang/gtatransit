import { MetaBar } from "@/components/MetaBar";
import { PageEmpty } from "@/components/PageEmpty";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";
import { StopTimeline } from "@/components/StopTimeline";
import { cleanHeadsign } from "@/lib/headsign";
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
  const data = await load(feedId, tripId, {
    fromStop: sp.fromStop,
    scheduleTrip: sp.scheduleTrip,
  });

  if (!data) {
    return (
      <PageShell rtUpdated={rtUpdated} demo={demo}>
        <PageHeader title="Trip unavailable" />
        <PageEmpty
          title="Could not load this trip"
          hint="It may have ended or is not in today's schedule."
        />
      </PageShell>
    );
  }

  const title = cleanHeadsign(data.headsign) || "Trip";
  const routeHref = data.route
    ? `/route/${feedId}/${encodeURIComponent(data.route.routeId)}`
    : undefined;
  const stopHref =
    sp.fromStop != null ? await stopBoardHref(feedId, sp.fromStop) : null;
  const metaItems = [
    ...(stopHref ? [{ label: "Stop board", href: stopHref }] : []),
    ...(data.vehicleId
      ? [
          {
            label: `Vehicle ${data.vehicleId}`,
            href: `/run/${feedId}/${encodeURIComponent(data.vehicleId)}`,
          },
        ]
      : []),
    ...(routeHref ? [{ label: "Route", href: routeHref }] : []),
  ];

  if (!data.stops.length) {
    return (
      <PageShell rtUpdated={rtUpdated} demo={demo}>
        <PageHeader
          title={title}
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
        <MetaBar items={metaItems} />
        <PageEmpty title="No upcoming stops" />
      </PageShell>
    );
  }

  return (
    <PageShell rtUpdated={rtUpdated} demo={demo}>
      <PageHeader
        title={title}
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
          }))}
        />
      </Section>
    </PageShell>
  );
}
