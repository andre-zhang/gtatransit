# GTA Transit Tracker

Real-time GTA transit map with stop departures, vehicle runs, and route schedules. Data from official GTFS and GTFS-RT feeds (TTC, GO, YRT, Brampton, DRT, MiWay).

## Setup

```bash
pnpm install
cp .env.example .env.local
```

### Database: Neon (recommended for Vercel)

1. In the [Vercel dashboard](https://vercel.com/dashboard) → your project → **Storage** → **Connect Database** → **Neon Postgres**.
2. Vercel injects env vars automatically (`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, etc.).
3. Pull them locally:

```bash
npx vercel env pull .env.local
```

4. Apply schema (uses direct / non-pooling URL):

```bash
pnpm db:migrate
```

5. Import GTFS (run locally — not on Vercel serverless):

```bash
pnpm fetch-gtfs
pnpm import-gtfs         # TTC import may take 30+ min
pnpm cluster-stops
```

When Neon env vars are present, the app uses **database mode** automatically. Without them, it falls back to **demo fixtures** on Vercel.

See `.env.example` for the full list of supported `POSTGRES_*` / `NEON_*` variables.

### Database: local Docker (dev alternative)

```bash
pnpm db:up
pnpm db:migrate
# set DATABASE_URL=postgresql://gta:gta@localhost:5433/gta_transit in .env.local
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

### Demo mode (no database)

With no Postgres env vars (or `DEMO_MODE=1`), the app uses prebuilt fixtures in `apps/web/demo/`.

To regenerate demo data locally after downloading GTFS:

```bash
npx pnpm@9.15.4 fetch-gtfs
npx pnpm@9.15.4 build-demo    # writes apps/web/demo/*.json
```

Then restart the dev server and refresh the browser.

### Deploy on Vercel

1. Import [github.com/andre-zhang/gtatransit](https://github.com/andre-zhang/gtatransit) on Vercel.
2. Set **Root Directory** to `apps/web`.
3. **Storage → Neon Postgres** — connect a database (env vars are auto-added).
4. Optional: `METROLINX_API_KEY` for GO live platforms/delays.
5. Run `pnpm db:migrate` locally against `POSTGRES_URL_NON_POOLING`, then import GTFS.

Without Neon, demo fixtures still work (~11 MB bundled in `apps/web/demo/`).

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

- **Neon Postgres** (via Vercel Storage) or Docker PostGIS for full data
- [Metrolinx API key](https://api.openmetrolinx.com/OpenDataAPI/Help/Registration/en) for GO real-time
- YRT GTFS ZIP from [YRT open data](https://www.yrt.ca/en/about-us/open-data.aspx)
