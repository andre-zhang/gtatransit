import Link from "next/link";
import { runPageHref } from "@/lib/detail-href";

export function VehicleLink({
  feedId,
  vehicleId,
  label,
  className = "font-bold text-go-navy hover:text-go-green",
  prefix = "#",
  onClick,
}: {
  feedId: string;
  vehicleId: string;
  label?: string | null;
  className?: string;
  prefix?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const display =
    label?.trim() && label.trim() !== vehicleId ? label.trim() : vehicleId;

  return (
    <Link
      href={runPageHref(feedId, vehicleId)}
      className={className}
      prefetch
      title={`Vehicle ${display}`}
      onClick={onClick}
    >
      {prefix}
      {display}
    </Link>
  );
}
