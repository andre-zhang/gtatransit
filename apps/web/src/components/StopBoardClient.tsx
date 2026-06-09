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
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState(initialRows);
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
    };

    const load = async () => {
      try {
        const res = await fetch(`/api/stops/${encodeURIComponent(groupId)}/departures`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        apply(await res.json());
      } catch {
        /* keep last good board */
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
      <DepartureTable rows={rows} stopName={name} />
    </div>
  );
}
