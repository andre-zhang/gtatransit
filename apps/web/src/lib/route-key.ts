export function layerRouteKey(
  agencyId: string,
  route: { id: string; shortName: string | null; longName: string | null },
  index: number,
): string {
  if (route.id) return `${agencyId}:${route.id}`;
  const slug = (route.longName ?? route.shortName ?? `route-${index}`)
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return `${agencyId}:_${slug}_${index}`;
}
