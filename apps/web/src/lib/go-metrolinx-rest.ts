import { GO_RT_API, metrolinxApiUrl } from "@gta/gtfs-rt";
import { serviceDate } from "./calendar";
import { formatGoPlatform } from "./go-stop-aliases";

export type GoNextDeparture = {
  stopId: string;
  routeShort: string;
  tripId: string;
  destination: string;
  predictedSec: number;
  platform?: string;
  delaySec?: number;
};

type MetrolinxMeta = { ErrorCode?: string; ErrorMessage?: string };

function metrolinxOk(data: unknown): boolean {
  const code = (data as { Metadata?: MetrolinxMeta })?.Metadata?.ErrorCode;
  if (!code) return true;
  return code === "0" || code === "200";
}

function metrolinxError(data: unknown): string | null {
  const meta = (data as { Metadata?: MetrolinxMeta })?.Metadata;
  if (!meta?.ErrorCode || meta.ErrorCode === "0" || meta.ErrorCode === "200") {
    return null;
  }
  return `${meta.ErrorCode}: ${meta.ErrorMessage ?? "error"}`;
}

function parseDepartureTime(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(":").map(Number);
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 3600 + get("minute") * 60 + get("second");
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function lineCode(row: Record<string, unknown>): string | undefined {
  const raw =
    row.Line ??
    row.LineCode ??
    row.RouteCode ??
    row.routeCode ??
    row.lineCode ??
    row.Route;
  return raw != null ? String(raw).trim() : undefined;
}

function platformFromRow(row: Record<string, unknown>): string | undefined {
  const raw =
    row.Platform ??
    row.platform ??
    row.Bay ??
    row.bay ??
    row.Track ??
    row.track ??
    row.PlatformDesignation ??
    row.AssignedPlatform ??
    row.DesignatedPlatform;
  if (raw == null || raw === "") return undefined;
  return formatGoPlatform(typeof raw === "number" ? String(raw) : String(raw));
}

function parseNextServiceStop(
  stopCode: string,
  payload: unknown,
): GoNextDeparture[] {
  if (!metrolinxOk(payload)) return [];
  const root = payload as Record<string, unknown>;
  const next = root.NextService as Record<string, unknown> | undefined;
  if (!next) return [];

  const candidates = [
    next.Stop,
    next.Stops,
    next.Departure,
    next.Departures,
    next,
  ];
  let rows: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (Array.isArray(candidate)) {
      rows = candidate.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
      if (rows.length) break;
    }
    const rec = candidate as Record<string, unknown>;
    const nested = asArray(
      rec.Stop ?? rec.Departure ?? rec.Departures ?? rec.Service ?? rec,
    ).filter((x) => x && typeof x === "object") as Record<string, unknown>[];
    if (nested.length) {
      rows = nested;
      break;
    }
  }

  const today = serviceDate();
  const out: GoNextDeparture[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const routeShort = lineCode(row as Record<string, unknown>);
    if (!routeShort) continue;

    const predictedSec = parseDepartureTime(
      (row as Record<string, unknown>).DepartureTime ??
        (row as Record<string, unknown>).ScheduledDepartureTime ??
        (row as Record<string, unknown>).Time,
    );
    if (predictedSec == null) continue;

    const tripNum =
      (row as Record<string, unknown>).TripNumber ??
      (row as Record<string, unknown>).Trip ??
      (row as Record<string, unknown>).TrainNumber;
    const tripSuffix = tripNum != null ? String(tripNum) : `${routeShort}-${predictedSec}`;
    const tripId = `${today}-${tripSuffix}`;

    const platform = platformFromRow(row as Record<string, unknown>);

    out.push({
      stopId: stopCode,
      routeShort,
      tripId,
      destination: String(
        (row as Record<string, unknown>).Destination ??
          (row as Record<string, unknown>).Direction ??
          routeShort,
      ),
      predictedSec,
      platform,
    });
  }

  return out;
}

const nextServiceCache = new Map<string, { at: number; rows: GoNextDeparture[] }>();
const NEXT_SERVICE_TTL_MS = 30_000;

export async function fetchGoNextService(
  stopCode: string,
  apiKey: string,
): Promise<{ rows: GoNextDeparture[]; error: string | null }> {
  const cached = nextServiceCache.get(stopCode);
  if (cached && Date.now() - cached.at < NEXT_SERVICE_TTL_MS) {
    return { rows: cached.rows, error: null };
  }

  try {
    const res = await fetch(
      metrolinxApiUrl(
        `api/V1/Stop/NextService/${encodeURIComponent(stopCode)}`,
        apiKey,
      ),
      { next: { revalidate: 0 } },
    );
    if (res.status === 204) {
      nextServiceCache.set(stopCode, { at: Date.now(), rows: [] });
      return { rows: [], error: null };
    }
    if (!res.ok) {
      return { rows: [], error: `NextService:${res.status}` };
    }
    const data: unknown = await res.json();
    const err = metrolinxError(data);
    if (err) {
      if (err.startsWith("204:")) {
        nextServiceCache.set(stopCode, { at: Date.now(), rows: [] });
        return { rows: [], error: null };
      }
      return { rows: [], error: err };
    }
    const rows = parseNextServiceStop(stopCode, data);
    nextServiceCache.set(stopCode, { at: Date.now(), rows });
    return { rows, error: null };
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Probe whether the key works for REST vs GTFS-RT (checks JSON Metadata, not HTTP status). */
export async function probeMetrolinxKey(apiKey: string): Promise<{
  stopApi: number | null;
  stopApiError: string | null;
  gtfsRt: number | null;
  gtfsRtError: string | null;
  gtfsEntities: number | null;
  gtfsDecodeError: string | null;
}> {
  let stopApi: number | null = null;
  let stopApiError: string | null = null;
  let gtfsRt: number | null = null;
  let gtfsRtError: string | null = null;
  let gtfsEntities: number | null = null;
  let gtfsDecodeError: string | null = null;

  try {
    const stopRes = await fetch(
      metrolinxApiUrl("api/V1/Stop/NextService/UN", apiKey),
    );
    stopApi = stopRes.status;
    const stopData: unknown = await stopRes.json();
    stopApiError = metrolinxError(stopData);
  } catch (e) {
    stopApiError = e instanceof Error ? e.message : String(e);
  }

  try {
    const gtfsRes = await fetch(metrolinxApiUrl(GO_RT_API.tripUpdates, apiKey));
    gtfsRt = gtfsRes.status;
    if (!gtfsRes.ok) {
      gtfsRtError = String(gtfsRes.status);
    } else {
      const buf = await gtfsRes.arrayBuffer();
      if (buf.byteLength === 0) {
        gtfsDecodeError = "empty body";
      } else {
        const head = new Uint8Array(buf)[0]!;
        if (head === 0x7b || head === 0x5b) {
          try {
            const json: unknown = JSON.parse(new TextDecoder().decode(buf));
            const err = metrolinxError(json);
            if (err) gtfsDecodeError = err;
            else {
              const { parseMetrolinxJsonTripUpdates } = await import("@gta/gtfs-rt");
              gtfsEntities = parseMetrolinxJsonTripUpdates("go", json).length;
            }
          } catch (e) {
            gtfsDecodeError = e instanceof Error ? e.message : String(e);
          }
        } else if (head === 0x3c) {
          gtfsDecodeError = "html response";
        } else {
          try {
            const { decodeFeed } = await import("@gta/gtfs-rt");
            const msg = decodeFeed(buf);
            gtfsEntities = msg.entity?.length ?? 0;
          } catch (e) {
            gtfsDecodeError = e instanceof Error ? e.message : String(e);
          }
        }
      }
    }
  } catch (e) {
    gtfsRtError = e instanceof Error ? e.message : String(e);
  }

  return { stopApi, stopApiError, gtfsRt, gtfsRtError, gtfsEntities, gtfsDecodeError };
}

export { metrolinxOk, metrolinxError };

export type GoTrainDetail = {
  cars: number | null;
  carsLabel: string | null;
  occupancyPercent: number | null;
  display: string | null;
  coachNumbers: string[];
};

const trainsCache = { at: 0, rows: [] as Record<string, unknown>[] };
const TRAINS_TTL_MS = 30_000;

function parseGoTripRef(tripId: string): { line: string; tripNumber: string } | null {
  const dated = tripId.match(/^\d{8}-([A-Za-z]{2,3})-(\d+)$/);
  if (dated) return { line: dated[1]!.toUpperCase(), tripNumber: dated[2]! };
  const bare = tripId.match(/^([A-Za-z]{2,3})-(\d+)$/);
  if (bare) return { line: bare[1]!.toUpperCase(), tripNumber: bare[2]! };
  return null;
}

function parseCars(raw: unknown): { count: number | null; label: string | null } {
  if (raw == null || raw === "") return { count: null, label: null };
  const s = String(raw).trim();
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) {
    return { count: n, label: `${n} coach${n === 1 ? "" : "es"}` };
  }
  const m = s.match(/(\d+)/);
  if (m) {
    const count = Number(m[1]);
    if (Number.isFinite(count) && count > 0) {
      return { count, label: `${count} coach${count === 1 ? "" : "es"}` };
    }
  }
  return { count: null, label: s };
}

async function loadGoTrains(apiKey: string): Promise<Record<string, unknown>[]> {
  if (trainsCache.rows.length && Date.now() - trainsCache.at < TRAINS_TTL_MS) {
    return trainsCache.rows;
  }

  const res = await fetch(
    metrolinxApiUrl("api/V1/ServiceataGlance/Trains/All", apiKey),
    { next: { revalidate: 0 } },
  );
  if (res.status === 204) {
    trainsCache.at = Date.now();
    trainsCache.rows = [];
    return [];
  }
  if (!res.ok) return trainsCache.rows;

  const data: unknown = await res.json();
  if (!metrolinxOk(data)) return trainsCache.rows;

  const root = data as Record<string, unknown>;
  const trips = root.Trips as Record<string, unknown> | undefined;
  const rows = asArray(trips?.Trip ?? trips?.trip).filter(
    (x) => x && typeof x === "object",
  ) as Record<string, unknown>[];

  trainsCache.at = Date.now();
  trainsCache.rows = rows;
  return rows;
}

function parseCoachNumbers(match: Record<string, unknown>): string[] {
  const out: string[] = [];
  const raw =
    match.CoachNumbers ??
    match.CarNumbers ??
    match.Consist ??
    match.CoachConsist ??
    match.coachNumbers;
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const s = String(x).trim();
      if (s) out.push(s);
    }
  } else if (raw != null && String(raw).trim()) {
    out.push(
      ...String(raw)
        .split(/[,;/|]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  const display = match.Display ?? match.display;
  if (display != null) {
    const s = String(display).trim();
    const labeled = s.match(/\b(?:coach|car)\s*#?\s*(\d+[A-Za-z]?)/gi);
    if (labeled) {
      for (const m of labeled) {
        const num = m.match(/(\d+[A-Za-z]?)/)?.[1];
        if (num) out.push(num);
      }
    }
    const bare = s.match(/\b(\d{3,4}[A-Za-z]?)\b/g);
    if (bare) out.push(...bare);
  }
  return [...new Set(out.map((x) => x.trim()).filter(Boolean))];
}

export async function fetchGoTrainDetail(
  tripId: string,
  apiKey: string,
): Promise<GoTrainDetail | null> {
  const ref = parseGoTripRef(tripId);
  if (!ref) return null;

  const rows = await loadGoTrains(apiKey);
  const tripNum = ref.tripNumber.replace(/^0+/, "") || ref.tripNumber;
  const match = rows.find((row) => {
    const line = String(row.LineCode ?? row.lineCode ?? "").trim().toUpperCase();
    const tripNumRaw = String(row.TripNumber ?? row.tripNumber ?? "").trim();
    const tripNumNorm = tripNumRaw.replace(/^0+/, "") || tripNumRaw;
    return line === ref.line && (tripNumNorm === tripNum || tripNumRaw === ref.tripNumber);
  });
  if (!match) return null;

  const { count, label } = parseCars(match.Cars ?? match.cars);
  const occupancy = Number(match.OccupancyPercentage ?? match.occupancyPercentage);
  const coachNumbers = parseCoachNumbers(match);
  return {
    cars: count,
    carsLabel: label,
    occupancyPercent: Number.isFinite(occupancy) ? occupancy : null,
    display: match.Display != null ? String(match.Display) : null,
    coachNumbers,
  };
}
