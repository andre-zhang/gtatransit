import Link from "next/link";
import { RoutePill } from "./RoutePill";

export type RoutePick = {
  feedId: string;
  routeId: string;
  routeShort: string;
  color: string;
};

export function RoutePicker({
  routes,
  onClose,
}: {
  routes: RoutePick[];
  onClose: () => void;
}) {
  if (!routes.length) return null;

  return (
    <div className="max-w-[min(18rem,calc(100%-1.5rem))] rounded-sm border border-[#d9d9d9] bg-go-surface shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between border-b border-go-bg px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-go-slate">
          Routes here
        </span>
        <button
          type="button"
          onClick={onClose}
          className="min-h-8 min-w-8 text-go-slate hover:text-go-navy"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <ul className="max-h-48 divide-y divide-go-bg overflow-y-auto">
        {routes.map((r) => (
          <li key={`${r.feedId}:${r.routeId}`}>
            <Link
              href={`/route/${r.feedId}/${encodeURIComponent(r.routeId)}`}
              className="flex items-center gap-2 px-3 py-2.5 hover:bg-go-bg/60"
              onClick={onClose}
            >
              <RoutePill
                shortName={r.routeShort}
                color={r.color}
                size="md"
              />
              <span className="min-w-0 truncate text-sm text-go-navy">{r.routeShort}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
