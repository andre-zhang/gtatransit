/** Demo schedule shards use merged GTFS trip ids; live TTC RT uses Surface ids. */
export function isDemoFixtureTripId(feedId: string, tripId: string): boolean {
  if (feedId === "ttc") return tripId.startsWith("504");
  if (feedId === "go") return /^\d{8}-/.test(tripId);
  return true;
}
