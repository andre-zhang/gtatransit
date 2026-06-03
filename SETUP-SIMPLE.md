# Simple setup (real GTFS data)

You only need to do **two things**: put your database URL in a file, then double-click a script.

## Step 1 — Copy your Neon database URL

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Open your **GTA Transit** project
3. Click **Storage** → your **Neon** database
4. Find **`POSTGRES_URL_NON_POOLING`** or **Direct connection** (not the pooled one)
5. Click **copy**
6. In this folder, create a file named **`neon-direct-url.txt`**
7. Paste the URL as **one line** (no quotes). Save.

(You can copy `neon-direct-url.txt.example` and rename it if that helps.)

## Step 2 — Run the loader

Double-click:

**`Setup-Neon.bat`**

Wait until it says **All done** (30–60 minutes is normal).

## Step 3 — Tell Vercel to use the database

1. Vercel → your project → **Settings** → **Environment Variables**
2. Add or edit: **`DEMO_MODE`** = **`0`**
3. Add **`METROLINX_API_KEY`** if you have a [Metrolinx API key](https://api.openmetrolinx.com/OpenDataAPI/Help/Registration/en) (for GO live buses)
4. **Deployments** → **Redeploy** latest

Done. The map should use real GTFS from Postgres, not demo JSON.

---

## Just want it working on your laptop?

Double-click **`Run.bat`** — uses demo data + live buses, no Neon required.
