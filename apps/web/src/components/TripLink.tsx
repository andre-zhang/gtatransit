import Link from "next/link";
import type { ReactNode } from "react";
import { tripPageHref } from "@/lib/detail-href";

export function TripLink({
  feedId,
  tripId,
  children,
  className = "text-go-green hover:text-go-navy hover:underline",
  scheduleTrip,
  fromStop,
  onClick,
}: {
  feedId: string;
  tripId: string;
  children: ReactNode;
  className?: string;
  scheduleTrip?: string;
  fromStop?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={tripPageHref(feedId, tripId, { scheduleTrip, fromStop })}
      className={className}
      prefetch
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
