export type ScheduleRow = {
  feedId: string;
  tripId: string;
  routeId: string;
  serviceId: string;
  departureTime: string;
  headsign: string;
  routeShort: string;
  routeColor: string;
  stopId: string;
};

export type TripStopRow = {
  stopId: string;
  name: string;
  sequence: number;
  arrivalTime: string;
  departureTime: string;
};
