import { routePageHref } from "@/lib/detail-href";
import { RoutePill } from "./RoutePill";

export function RouteLink({
  feedId,
  routeId,
  shortName,
  color,
  size = "md",
}: {
  feedId: string;
  routeId: string;
  shortName: string;
  color: string;
  size?: "md" | "lg";
}) {
  return (
    <RoutePill
      shortName={shortName}
      color={color}
      size={size}
      href={routePageHref(feedId, routeId)}
    />
  );
}
