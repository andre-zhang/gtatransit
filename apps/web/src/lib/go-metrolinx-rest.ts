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

function parseNextServiceStop(
  stopCode: string,
  payload: unknown,
): GoNextDeparture[] {
  if (!metrolinxOk(payload)) return [];
  const root = payload as Record<string, unknown>;
  const next = root.NextService as Record<string, unknown> | undefined;
  if (!next) return [];

  const stopNode = (next.Stop ?? next) as Record<string, unknown>;
  const rows = asArray(
    (stopNode.Stop as Record<string, unknown> | undefined) ??
      (stopNode.Departure as Record<string, unknown> | undefined) ??
      stopNode,
  );

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

    const platform = formatGoPlatform(
      String(
        (row as Record<string, unknown>).Platform ??
          (row as Record<string, unknown>).Bay ??
          (row as Record<string, unknown>).Track ??
          "",
      ) || undefined,
    );

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
        if (head === 0x7b || head === 0x3c) {
          gtfsDecodeError = "non-protobuf response";
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
