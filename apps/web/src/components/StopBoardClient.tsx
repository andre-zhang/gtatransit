"use client";

import { useEffect, useRef, useState } from "react";
import { DepartureTable, type DepartureRow } from "./DepartureTable";

export function StopBoardClient({
  groupId,
  initialName,
  initialRows,
}: {
  groupId: string;
  initialName: string;
  initialRows: DepartureRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef(initialRows);

  useEffect(() => {
    setRows(initialRows);
    rowsRef.current = initialRows;
    setError(null);
  }, [groupId, initialRows]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setRefreshing(true);
      try {
        const res = await fetch(`/api/stops/${encodeURIComponent(groupId)}/departures`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setError("Could not refresh departures.");
          return;
        }
        const data = (await res.json()) as { rows: DepartureRow[] };
        setRows(data.rows);
        rowsRef.current = data.rows;
        setError(null);
      } catch {
        if (!cancelled) setError("Could not refresh departures.");
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };

    void load();
    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [groupId]);

  return (
    <div className="departure-board">
      {(refreshing || error) && (
        <div className="flex items-center justify-between border-b border-go-bg px-4 py-2 text-xs text-go-slate">
          <span>{refreshing ? "Updating…" : " "}</span>
          {error && <span className="text-go-late">{error}</span>}
        </div>
      )}
      <DepartureTable rows={rows} stopName={initialName} />
    </div>
  );
}
