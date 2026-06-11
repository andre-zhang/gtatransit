import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { serverBaseUrl } from "@/lib/server-base-url";

type Stop = {
  stopId: string;
  name: string;
  sequence: number;
  scheduled: string;
  predicted?: string;
  delayMin?: number;
  platform?: string;
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
  return res.json() as Promise<{ stops: Stop[]; vehicleId?: string; headsign?: string | null }>;
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
  const data = await load(feedId, tripId, {
    fromStop: sp.fromStop,
    scheduleTrip: sp.scheduleTrip,
  });

  if (!data) {
    return (
      <PageShell>
        <PageHeader title="Trip unavailable" subtitle={tripId} />
        <div className="px-6 py-12 text-center text-go-slate">
          Could not load this trip. It may have ended or is not in today&apos;s schedule.
        </div>
      </PageShell>
    );
  }

  if (!data.stops.length) {
    return (
      <PageShell>
        <PageHeader title="Upcoming stops" subtitle={data.headsign ?? tripId} />
        <div className="departure-board-empty">
          <p className="departure-board-emptyTitle">No upcoming stops</p>
          <p className="departure-board-emptyHint">
            Could not load stop list for this trip.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader title="Upcoming stops" subtitle={data.headsign ?? tripId} />
      {data.vehicleId && (
        <div className="border-b border-go-bg px-5 py-3 text-sm text-go-slate">
          Vehicle{" "}
          <Link
            href={`/run/${feedId}/${encodeURIComponent(data.vehicleId)}`}
            className="font-bold text-go-green"
          >
            {data.vehicleId}
          </Link>
        </div>
      )}
      <ul className="divide-y divide-go-bg">
        {data.stops.map((s, i) => (
          <li
            key={`${s.stopId}-${s.sequence}`}
            className={`flex items-center gap-4 px-5 py-3 ${i === 0 ? "bg-go-green/5" : ""}`}
          >
            <span className="w-16 shrink-0 text-right text-lg font-bold tabular-nums text-go-navy">
              {s.predicted ?? s.scheduled}
            </span>
            <span className="min-w-0 flex-1 truncate text-go-navy">{s.name}</span>
            {feedId === "go" && s.platform && (
              <span className="shrink-0 text-sm tabular-nums text-go-slate">Plat {s.platform}</span>
            )}
            {s.delayMin != null && s.delayMin > 0 && (
              <span className="go-badge go-badge--late shrink-0">+{s.delayMin} min</span>
            )}
            {s.delayMin != null && s.delayMin < 0 && (
              <span className="go-badge go-badge--early shrink-0">{s.delayMin} min</span>
            )}
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
