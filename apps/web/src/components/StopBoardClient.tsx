"use client";

import { useEffect, useRef, useState } from "react";
import { DepartureTable, type DepartureRow } from "./DepartureTable";

function formatUpdated(at: Date): string {
  return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function StopBoardClient({
  groupId,
  initialName,
  initialRows,
}: {
  groupId: string;
  initialName: string;
  initialRows: DepartureRow[];
}) {
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState(initialRows);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const rowsRef = useRef(initialRows);

  useEffect(() => {
    setName(initialName);
    setRows(initialRows);
    rowsRef.current = initialRows;
  }, [groupId, initialName, initialRows]);

  useEffect(() => {
    let cancelled = false;

    const apply = (data: { name: string; rows: DepartureRow[] }) => {
      if (cancelled) return;
      if (data.name) setName(data.name);
      setRows(data.rows);
      rowsRef.current = data.rows;
      setUpdatedAt(new Date());
      setRefreshing(false);
    };

    const load = async () => {
      setRefreshing(true);
      try {
        const res = await fetch(`/api/stops/${encodeURIComponent(groupId)}/departures`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setRefreshing(false);
          return;
        }
        apply(await res.json());
      } catch {
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
      <div className="flex items-center justify-between gap-3 border-b border-go-bg px-5 py-2 text-xs text-go-slate">
        <span className="truncate font-medium text-go-navy">{name}</span>
        <span className="shrink-0 tabular-nums">
          {refreshing && !updatedAt
            ? "Updating…"
            : updatedAt
              ? `Updated ${formatUpdated(updatedAt)}`
              : "Live board"}
        </span>
      </div>
      <DepartureTable rows={rows} stopName={name} />
    </div>
  );
}
