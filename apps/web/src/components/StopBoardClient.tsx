"use client";

import { useEffect, useRef, useState } from "react";
import { DepartureTable, type DepartureRow } from "./DepartureTable";

export function StopBoardClient({
  groupId,
  initialRows,
}: {
  groupId: string;
  initialName: string;
  initialRows: DepartureRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const rowsRef = useRef(initialRows);

  useEffect(() => {
    setRows(initialRows);
    rowsRef.current = initialRows;
  }, [groupId, initialRows]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/stops/${encodeURIComponent(groupId)}/departures`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { rows: DepartureRow[] };
        setRows(data.rows);
        rowsRef.current = data.rows;
      } catch {
        /* keep last good board */
      }
    };

    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [groupId]);

  return (
    <div className="departure-board">
      <DepartureTable rows={rows} />
    </div>
  );
}
