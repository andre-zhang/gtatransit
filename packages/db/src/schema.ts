import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const feeds = pgTable("feeds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url"),
  version: text("version"),
  importedAt: timestamp("imported_at", { withTimezone: true }),
});

export const agencies = pgTable(
  "agencies",
  {
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    agencyId: text("agency_id").notNull(),
    name: text("name").notNull(),
    url: text("url"),
    timezone: text("timezone").notNull().default("America/Toronto"),
  },
  (t) => [primaryKey({ columns: [t.feedId, t.agencyId] })],
);

export const routes = pgTable(
  "routes",
  {
    feedId: text("feed_id").notNull(),
    routeId: text("route_id").notNull(),
    agencyId: text("agency_id").notNull(),
    shortName: text("short_name"),
    longName: text("long_name"),
    routeType: integer("route_type").notNull(),
    color: text("color"),
    textColor: text("text_color"),
  },
  (t) => [
    primaryKey({ columns: [t.feedId, t.routeId] }),
    index("routes_feed_agency_idx").on(t.feedId, t.agencyId),
  ],
);

export const stops = pgTable(
  "stops",
  {
    feedId: text("feed_id").notNull(),
    stopId: text("stop_id").notNull(),
    name: text("name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    locationType: integer("location_type").default(0),
    parentStation: text("parent_station"),
    directionId: integer("direction_id"),
    bearing: real("bearing"),
    tripCount: integer("trip_count").default(0),
  },
  (t) => [
    primaryKey({ columns: [t.feedId, t.stopId] }),
    index("stops_geo_idx").on(t.feedId, t.lat, t.lon),
  ],
);

export const trips = pgTable(
  "trips",
  {
    feedId: text("feed_id").notNull(),
    tripId: text("trip_id").notNull(),
    routeId: text("route_id").notNull(),
    serviceId: text("service_id").notNull(),
    headsign: text("headsign"),
    directionId: integer("direction_id"),
    blockId: text("block_id"),
    shapeId: text("shape_id"),
  },
  (t) => [
    primaryKey({ columns: [t.feedId, t.tripId] }),
    index("trips_block_idx").on(t.feedId, t.blockId),
    index("trips_route_idx").on(t.feedId, t.routeId),
  ],
);

export const calendar = pgTable(
  "calendar",
  {
    feedId: text("feed_id").notNull(),
    serviceId: text("service_id").notNull(),
    monday: boolean("monday").notNull(),
    tuesday: boolean("tuesday").notNull(),
    wednesday: boolean("wednesday").notNull(),
    thursday: boolean("thursday").notNull(),
    friday: boolean("friday").notNull(),
    saturday: boolean("saturday").notNull(),
    sunday: boolean("sunday").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
  },
  (t) => [primaryKey({ columns: [t.feedId, t.serviceId] })],
);

export const calendarDates = pgTable(
  "calendar_dates",
  {
    feedId: text("feed_id").notNull(),
    serviceId: text("service_id").notNull(),
    date: text("date").notNull(),
    exceptionType: integer("exception_type").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.feedId, t.serviceId, t.date] }),
    index("calendar_dates_date_idx").on(t.feedId, t.date),
  ],
);

export const stopTimes = pgTable(
  "stop_times",
  {
    feedId: text("feed_id").notNull(),
    tripId: text("trip_id").notNull(),
    arrivalTime: text("arrival_time").notNull(),
    departureTime: text("departure_time").notNull(),
    stopId: text("stop_id").notNull(),
    stopSequence: integer("stop_sequence").notNull(),
    pickupType: integer("pickup_type").default(0),
    dropOffType: integer("drop_off_type").default(0),
  },
  (t) => [
    primaryKey({ columns: [t.feedId, t.tripId, t.stopSequence] }),
    index("stop_times_stop_idx").on(t.feedId, t.stopId, t.departureTime),
    index("stop_times_trip_idx").on(t.feedId, t.tripId),
  ],
);

export const routeShapes = pgTable(
  "route_shapes",
  {
    feedId: text("feed_id").notNull(),
    routeId: text("route_id").notNull(),
    directionId: integer("direction_id").notNull().default(0),
    geojson: text("geojson").notNull(),
  },
  (t) => [primaryKey({ columns: [t.feedId, t.routeId, t.directionId] })],
);

export const stopGroups = pgTable("stop_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  bearing: real("bearing"),
});

export const stopGroupMembers = pgTable(
  "stop_group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => stopGroups.id, { onDelete: "cascade" }),
    feedId: text("feed_id").notNull(),
    stopId: text("stop_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.feedId, t.stopId] }),
    index("stop_group_members_stop_idx").on(t.feedId, t.stopId),
  ],
);

export const rtVehicles = pgTable(
  "rt_vehicles",
  {
    feedId: text("feed_id").notNull(),
    vehicleId: text("vehicle_id").notNull(),
    tripId: text("trip_id"),
    routeId: text("route_id"),
    label: text("label"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    bearing: real("bearing"),
    speed: real("speed"),
    currentStopSequence: integer("current_stop_sequence"),
    delaySec: integer("delay_sec"),
    occupancyStatus: integer("occupancy_status"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.feedId, t.vehicleId] }),
    index("rt_vehicles_route_idx").on(t.feedId, t.routeId),
    index("rt_vehicles_trip_idx").on(t.feedId, t.tripId),
  ],
);

export const rtTripUpdates = pgTable(
  "rt_trip_updates",
  {
    feedId: text("feed_id").notNull(),
    tripId: text("trip_id").notNull(),
    stopId: text("stop_id").notNull(),
    stopSequence: integer("stop_sequence"),
    delaySec: integer("delay_sec"),
    arrivalTime: integer("arrival_time"),
    departureTime: integer("departure_time"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.feedId, t.tripId, t.stopId] }),
    index("rt_trip_updates_trip_idx").on(t.feedId, t.tripId),
  ],
);

export const feedMeta = pgTable("feed_meta", {
  feedId: text("feed_id").primaryKey(),
  rtUpdatedAt: timestamp("rt_updated_at", { withTimezone: true }),
});
