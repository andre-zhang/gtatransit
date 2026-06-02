import type { Feature, FeatureCollection, Point } from "geojson";

export type VehicleGeoProps = {
  feedId: string;
  vehicleId: string;
  label?: string | null;
  routeId?: string | null;
  delaySec?: number | null;
  bearing: number;
};

export function vehicleFeature(
  lon: number,
  lat: number,
  props: Omit<VehicleGeoProps, never> & { bearing?: number | null },
): Feature<Point, VehicleGeoProps> {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      feedId: props.feedId,
      vehicleId: props.vehicleId,
      label: props.label,
      routeId: props.routeId,
      delaySec: props.delaySec,
      bearing: props.bearing ?? 0,
    },
  };
}

export function vehicleCollection(
  items: Array<{
    lon: number;
    lat: number;
    feedId: string;
    vehicleId: string;
    label?: string | null;
    routeId?: string | null;
    delaySec?: number | null;
    bearing?: number | null;
  }>,
): FeatureCollection<Point, VehicleGeoProps> {
  return {
    type: "FeatureCollection",
    features: items.map((v) =>
      vehicleFeature(v.lon, v.lat, {
        feedId: v.feedId,
        vehicleId: v.vehicleId,
        label: v.label,
        routeId: v.routeId,
        delaySec: v.delaySec,
        bearing: v.bearing ?? 0,
      }),
    ),
  };
}
