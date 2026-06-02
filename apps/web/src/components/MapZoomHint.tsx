import { ZOOM_ROUTES, ZOOM_STOPS } from "@/lib/map-zoom";

export function MapZoomHint({
  zoom,
  showRoutes,
  showStops,
}: {
  zoom: number;
  showRoutes: boolean;
  showStops: boolean;
}) {
  const needsRoutes = showRoutes && zoom < ZOOM_ROUTES;
  const needsStops = showStops && zoom < ZOOM_STOPS;
  if (!needsRoutes && !needsStops) return null;

  const parts: string[] = [];
  if (needsRoutes) parts.push(`routes (z${ZOOM_ROUTES}+)`);
  if (needsStops) parts.push(`stops (z${ZOOM_STOPS}+)`);

  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 max-w-md -translate-x-1/2 rounded-full bg-go-navy/90 px-4 py-2 text-center text-xs font-medium text-white shadow-lg">
      Zoom in for {parts.join(" · ")}
    </div>
  );
}
