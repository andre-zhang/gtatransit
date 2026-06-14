export type RtVehicle = {
  feedId: string;
  vehicleId: string;
  tripId?: string;
  routeId?: string;
  label?: string;
  lat?: number;
  lon?: number;
  bearing?: number;
  speed?: number;
  currentStopSequence?: number;
  delaySec?: number;
  occupancyStatus?: number;
};

export type RtTripUpdate = {
  feedId: string;
  tripId: string;
  routeId?: string;
  stopId: string;
  stopSequence?: number;
  delaySec?: number;
  arrivalTime?: number;
  departureTime?: number;
  platform?: string;
};
