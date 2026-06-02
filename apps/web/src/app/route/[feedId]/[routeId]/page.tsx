import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { RouteViewClient } from "./RouteViewClient";
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
  const data = await load(feedId, routeId, direction);

  if (!data) {
    return (
      <PageShell>
        <PageHeader title="Route not found" />
        <div className="px-6 py-12 text-center text-go-slate">
          No schedule data for this route in demo mode.
        </div>
      </PageShell>
    );
  }

  const title =
    data.route.long_name ?? data.route.short_name ?? routeId;

  return (
    <PageShell>
      <PageHeader
        title={title}
        routeBadge={{
          shortName: data.route.short_name ?? routeId,
          color: data.route.color,
        }}
      />
      <RouteViewClient
        feedId={feedId}
        routeId={routeId}
        direction={direction}
        trips={data.trips}
        vehicles={data.vehicles}
      />
    </PageShell>
  );
}
