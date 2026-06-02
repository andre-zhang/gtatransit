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
    <header className="relative overflow-hidden bg-go-green px-6 pb-6 pt-5 text-white">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-go-green-light/20"
        aria-hidden
      />
      <Link
        href={backHref}
        className="relative inline-flex items-center gap-1 text-sm font-medium text-white/85 transition hover:text-white"
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
        Map
      </Link>
      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        {routeBadge && (
          <RoutePill shortName={routeBadge.shortName} color={routeBadge.color} size="lg" />
        )}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      {subtitle && <p className="relative mt-1 text-base text-white/90">{subtitle}</p>}
    </header>
  );
}
