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

With `DEMO_MODE=1` (or on Vercel without `DATABASE_URL`), the app uses prebuilt fixtures in `apps/web/demo/` — no GTFS import at runtime.

To regenerate demo data locally after downloading GTFS:

```bash
npx pnpm@9.15.4 fetch-gtfs
npx pnpm@9.15.4 build-demo    # writes apps/web/demo/*.json
```

Then restart the dev server and refresh the browser.

### Deploy on Vercel

1. Import [github.com/andre-zhang/gtatransit](https://github.com/andre-zhang/gtatransit) on Vercel.
2. Set **Root Directory** to `apps/web`.
3. Framework preset: **Next.js** (install command is in `apps/web/vercel.json`).
4. Environment variables:
   - `METROLINX_API_KEY` — optional, enables GO live platforms/delays
   - `DATABASE_URL` — only if you later attach Neon/Postgres for full DB mode
   - `DEMO_MODE=1` — optional; auto-enabled on Vercel when `DATABASE_URL` is unset

Demo fixtures (~11 MB) are committed in `apps/web/demo/` so Vercel does not need GTFS zips or PostGIS at build or runtime.

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
