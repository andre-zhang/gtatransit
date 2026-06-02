CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  version TEXT,
  imported_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agencies (
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  PRIMARY KEY (feed_id, agency_id)
);

CREATE TABLE IF NOT EXISTS routes (
  feed_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  short_name TEXT,
  long_name TEXT,
  route_type INTEGER NOT NULL,
  color TEXT,
  text_color TEXT,
  PRIMARY KEY (feed_id, route_id)
);
CREATE INDEX IF NOT EXISTS routes_feed_agency_idx ON routes (feed_id, agency_id);

CREATE TABLE IF NOT EXISTS stops (
  feed_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  location_type INTEGER DEFAULT 0,
  parent_station TEXT,
  direction_id INTEGER,
  bearing REAL,
  trip_count INTEGER DEFAULT 0,
  geom GEOMETRY(Point, 4326),
  PRIMARY KEY (feed_id, stop_id)
);
CREATE INDEX IF NOT EXISTS stops_geo_idx ON stops USING GIST (geom);

CREATE TABLE IF NOT EXISTS trips (
  feed_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  headsign TEXT,
  direction_id INTEGER,
  block_id TEXT,
  shape_id TEXT,
  PRIMARY KEY (feed_id, trip_id)
);
CREATE INDEX IF NOT EXISTS trips_block_idx ON trips (feed_id, block_id);
CREATE INDEX IF NOT EXISTS trips_route_idx ON trips (feed_id, route_id);

CREATE TABLE IF NOT EXISTS calendar (
  feed_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  monday BOOLEAN NOT NULL,
  tuesday BOOLEAN NOT NULL,
  wednesday BOOLEAN NOT NULL,
  thursday BOOLEAN NOT NULL,
  friday BOOLEAN NOT NULL,
  saturday BOOLEAN NOT NULL,
  sunday BOOLEAN NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  PRIMARY KEY (feed_id, service_id)
);

CREATE TABLE IF NOT EXISTS calendar_dates (
  feed_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  date TEXT NOT NULL,
  exception_type INTEGER NOT NULL,
  PRIMARY KEY (feed_id, service_id, date)
);
CREATE INDEX IF NOT EXISTS calendar_dates_date_idx ON calendar_dates (feed_id, date);

CREATE TABLE IF NOT EXISTS stop_times (
  feed_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  arrival_time TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL,
  pickup_type INTEGER DEFAULT 0,
  drop_off_type INTEGER DEFAULT 0,
  PRIMARY KEY (feed_id, trip_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS stop_times_stop_idx ON stop_times (feed_id, stop_id, departure_time);
CREATE INDEX IF NOT EXISTS stop_times_trip_idx ON stop_times (feed_id, trip_id);

CREATE TABLE IF NOT EXISTS route_shapes (
  feed_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  direction_id INTEGER NOT NULL DEFAULT 0,
  geojson TEXT NOT NULL,
  geom GEOMETRY(LineString, 4326),
  PRIMARY KEY (feed_id, route_id, direction_id)
);
CREATE INDEX IF NOT EXISTS route_shapes_geom_idx ON route_shapes USING GIST (geom);

CREATE TABLE IF NOT EXISTS stop_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  bearing REAL,
  geom GEOMETRY(Point, 4326)
);
CREATE INDEX IF NOT EXISTS stop_groups_geom_idx ON stop_groups USING GIST (geom);

CREATE TABLE IF NOT EXISTS stop_group_members (
  group_id TEXT NOT NULL REFERENCES stop_groups(id) ON DELETE CASCADE,
  feed_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  PRIMARY KEY (group_id, feed_id, stop_id)
);
CREATE INDEX IF NOT EXISTS stop_group_members_stop_idx ON stop_group_members (feed_id, stop_id);

CREATE TABLE IF NOT EXISTS rt_vehicles (
  feed_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  trip_id TEXT,
  route_id TEXT,
  label TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  bearing REAL,
  speed REAL,
  current_stop_sequence INTEGER,
  delay_sec INTEGER,
  occupancy_status INTEGER,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (feed_id, vehicle_id)
);
CREATE INDEX IF NOT EXISTS rt_vehicles_route_idx ON rt_vehicles (feed_id, route_id);

CREATE TABLE IF NOT EXISTS rt_trip_updates (
  feed_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  stop_sequence INTEGER,
  delay_sec INTEGER,
  arrival_time INTEGER,
  departure_time INTEGER,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (feed_id, trip_id, stop_id)
);

CREATE TABLE IF NOT EXISTS feed_meta (
  feed_id TEXT PRIMARY KEY,
  rt_updated_at TIMESTAMPTZ
);
