import Link from "next/link";
import { RoutePill } from "./RoutePill";

export function PageHeader({
  backHref = "/",
  title,
  subtitle,
  routeBadge,
}: {
  backHref?: string;
  title: string;
  subtitle?: string;
  routeBadge?: { shortName: string; color: string };
}) {
  return (
    <header className="border-b-4 border-go-green-dark bg-go-green px-5 pb-5 pt-4 text-white">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm font-semibold text-white/90 hover:text-white"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M10 12L6 8l4-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to map
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {routeBadge && (
          <RoutePill shortName={routeBadge.shortName} color={routeBadge.color} size="lg" />
        )}
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      </div>
      {subtitle && <p className="mt-1 text-sm text-white/90">{subtitle}</p>}
    </header>
  );
}
