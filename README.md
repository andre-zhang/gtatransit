# GTA Transit Tracker

Real-time GTA transit map with stop departures, vehicle runs, and route schedules. Data from official GTFS and GTFS-RT feeds (TTC, GO, YRT, Brampton, DRT, MiWay).

## Setup

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
```

### GTFS data

```bash
pnpm fetch-gtfs          # download feeds (YRT: set YRT_GTFS_ZIP in .env)
pnpm import-gtfs         # import to PostGIS (TTC import may take 30+ min)
pnpm cluster-stops       # build merged stop groups
```

### Real-time

```bash
# Optional: METROLINX_API_KEY for GO Transit RT
pnpm rt:poll
```

### Demo mode (no Docker)

With `DEMO_MODE=1`, the app uses `apps/web/demo/fixtures.json`. After downloading GTFS:

```bash
npx pnpm@9.15.4 fetch-gtfs
npx pnpm@9.15.4 build-demo    # all routes from zips → layer list + map shapes
```

Then restart the dev server and refresh the browser.

### Web app

```bash
pnpm dev                 # http://localhost:3001
```

## Structure

- `apps/web` — Next.js UI + API
- `packages/db` — schema and migrations
- `packages/gtfs-import` — fetch, import, stop clustering
- `packages/gtfs-rt` — GTFS-RT parsing
- `services/rt-poller` — background RT worker

## Prerequisites

- Docker (PostGIS)
- [Metrolinx API key](https://api.openmetrolinx.com/OpenDataAPI/Help/Registration/en) for GO real-time
- YRT GTFS ZIP from [YRT open data](https://www.yrt.ca/en/about-us/open-data.aspx)
