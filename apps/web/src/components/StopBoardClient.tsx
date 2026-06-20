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
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const rowsRef = useRef<DepartureRow[]>([]);

  const load = useCallback(
    async (opts?: { background?: boolean; quick?: boolean }) => {
      const isQuick = opts?.quick === true;
      const isBackground = opts?.background === true;

      if (isBackground) {
        setRefreshing(true);
      } else if (!isQuick) {
        setLoading(true);
      }

      try {
        const url = `/api/stops/${encodeURIComponent(groupId)}/departures${
          isQuick ? "?quick=1" : ""
        }`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          if (rowsRef.current.length === 0 && (isBackground || !isQuick)) {
            setError("Could not load departures.");
          }
          return;
        }
        const data = (await res.json()) as { name: string; rows: DepartureRow[] };
        setName(data.name || "Stop");
        setRows(data.rows);
        rowsRef.current = data.rows;
        setError(null);
      } catch {
        if (rowsRef.current.length === 0 && (isBackground || !isQuick)) {
          setError("Could not load departures.");
        }
      } finally {
        if (isBackground) {
          setRefreshing(false);
          setInitialLoadDone(true);
        }
        if (!isBackground || rowsRef.current.length === 0) {
          setLoading(false);
        }
        if (!isQuick) setInitialLoadDone(true);
      }
    },
    [groupId],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load({ quick: true });
      void load({ background: true });
    })();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => void load({ background: true }), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const showTable = !error && (rows.length > 0 || (initialLoadDone && !loading));

  return (
    <>
      <PageHeader title={loading && name === "Stop" ? "Loading…" : name} />
      <div className="departure-board">
        {(loading || error || refreshing) && (
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-go-bg px-2.5 py-2 text-xs text-go-slate sm:px-4">
            <span>
              {loading
                ? "Loading departures…"
                : refreshing
                  ? "Updating live times…"
                  : " "}
            </span>
            {error && <span className="text-go-late">{error}</span>}
          </div>
        )}
        {showTable && <DepartureTable rows={rows} stopName={name} />}
      </div>
    </>
  );
}
