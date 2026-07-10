import { Suspense } from "react";
import { DetailLoading } from "@/components/DetailLoading";
import { PageEmpty } from "@/components/PageEmpty";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { routePageHref } from "@/lib/detail-href";
import { getPageMeta } from "@/lib/page-meta";
import { serverBaseUrl } from "@/lib/server-base-url";
import { RouteViewClient } from "./RouteViewClient";

async function load(feedId: string, routeId: string, direction: number) {
  const base = await serverBaseUrl();
  const res = await fetch(
    `${base}/api/routes/${feedId}/${encodeURIComponent(routeId)}?direction=${direction}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json();
}

async function RoutePageContent({
  feedId,
  routeId,
  direction,
}: {
  feedId: string;
  routeId: string;
  direction: number;
}) {
  // Always go through the API route so the CDN cache is shared with client refreshes.
  const data = await load(feedId, routeId, direction);

  if (!data) {
    return (
      <>
        <PageHeader title="Route unavailable" />
        <PageEmpty
          title="Could not load this route"
          hint="It may not exist in the schedule, or the server timed out."
        />
      </>
    );
  }

  const title = data.route.long_name ?? data.route.short_name ?? routeId;
  const routeHref = routePageHref(feedId, routeId);

  return (
    <>
      <PageHeader
        title={title}
        routeBadge={{
          shortName: data.route.short_name ?? routeId,
          color: data.route.color,
          href: routeHref,
        }}
      />
      <RouteViewClient
        feedId={feedId}
        routeId={routeId}
        direction={direction}
        directionLabels={data.directionLabels}
        trips={data.trips}
        vehicles={data.vehicles}
      />
    </>
  );
}

export default async function RoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ feedId: string; routeId: string }>;
  searchParams: Promise<{ direction?: string }>;
}) {
  const { feedId, routeId } = await params;
  const sp = await searchParams;
  const direction = Number(sp.direction ?? 0);
  const { demo, rtUpdated } = await getPageMeta();

  return (
    <PageShell rtUpdated={rtUpdated} demo={demo}>
      <Suspense fallback={<DetailLoading message="Loading route…" />}>
        <RoutePageContent feedId={feedId} routeId={routeId} direction={direction} />
      </Suspense>
    </PageShell>
  );
}
