"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DepartureTable, type DepartureRow } from "./DepartureTable";
import { PageHeader } from "./PageHeader";

export function StopBoardClient({ groupId }: { groupId: string }) {
  const [name, setName] = useState("Stop");
  const [rows, setRows] = useState<DepartureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef<DepartureRow[]>([]);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    if (opts?.background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/stops/${encodeURIComponent(groupId)}/departures`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Could not load departures.");
        return;
      }
      const data = (await res.json()) as { name: string; rows: DepartureRow[] };
      setName(data.name || "Stop");
      setRows(data.rows);
      rowsRef.current = data.rows;
      setError(null);
    } catch {
      setError("Could not load departures.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => void load({ background: true }), 20_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <>
      <PageHeader title={loading && name === "Stop" ? "Loading…" : name} />
      <div className="departure-board">
        {(loading || error || refreshing) && (
          <div className="flex items-center justify-between border-b border-go-bg px-4 py-2 text-xs text-go-slate">
            <span>
              {loading
                ? "Loading departures…"
                : refreshing
                  ? "Updating…"
                  : " "}
            </span>
            {error && <span className="text-go-late">{error}</span>}
          </div>
        )}
        {!loading && !error && (
          <DepartureTable rows={rows} stopName={name} />
        )}
      </div>
    </>
  );
}
