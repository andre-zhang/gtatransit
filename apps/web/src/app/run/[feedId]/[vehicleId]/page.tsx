import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { RunViewClient } from "@/components/RunViewClient";
import { cleanHeadsign } from "@/lib/headsign";
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
  const data = await load(feedId, vehicleId);

  if (!data) {
    return (
      <PageShell>
        <PageHeader title="Vehicle" />
        <RunViewClient feedId={feedId} vehicleId={vehicleId} initial={null} />
      </PageShell>
    );
  }

  const { vehicle, trip, route } = data as {
    vehicle: { label: string; delayMin: number | null };
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
  const routeLabel = route?.short_name ?? trip?.route_id ?? "?";

  return (
    <PageShell>
      <PageHeader
        title={headsign}
        routeBadge={
          route || trip
            ? {
                shortName: routeLabel,
                color: route?.color ?? "#007934",
              }
            : undefined
        }
      />
      <RunViewClient feedId={feedId} vehicleId={vehicleId} initial={data} />
    </PageShell>
  );
}
