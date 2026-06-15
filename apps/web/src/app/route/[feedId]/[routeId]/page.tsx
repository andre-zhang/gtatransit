import { PageEmpty } from "@/components/PageEmpty";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { RouteViewClient } from "./RouteViewClient";
import { getPageMeta } from "@/lib/page-meta";
import { serverBaseUrl } from "@/lib/server-base-url";

async function load(feedId: string, routeId: string, direction: number) {
  const base = await serverBaseUrl();
  const res = await fetch(
    `${base}/api/routes/${feedId}/${encodeURIComponent(routeId)}?direction=${direction}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json();
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
  const data = await load(feedId, routeId, direction);

  if (!data) {
    return (
      <PageShell rtUpdated={rtUpdated} demo={demo}>
        <PageHeader title="Route unavailable" />
        <PageEmpty
          title="Could not load this route"
          hint="It may not exist in the schedule, or the server timed out."
        />
      </PageShell>
    );
  }

  const title = data.route.long_name ?? data.route.short_name ?? routeId;
  const routeHref = `/route/${feedId}/${encodeURIComponent(routeId)}`;

  return (
    <PageShell rtUpdated={rtUpdated} demo={demo}>
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
    </PageShell>
  );
}
