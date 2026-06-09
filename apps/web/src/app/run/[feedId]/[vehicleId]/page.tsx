import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { RunViewClient } from "@/components/RunViewClient";
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
        <div className="py-16 text-center text-go-slate">
          Vehicle not found or no longer reporting location.
        </div>
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

  const headsign =
    trip?.headsign ?? route?.long_name ?? route?.short_name ?? "In service";
  const routeLabel = route?.short_name ?? trip?.route_id ?? "?";

  return (
    <PageShell>
      <PageHeader
        title={`Vehicle ${vehicle.label}`}
        subtitle={headsign}
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
