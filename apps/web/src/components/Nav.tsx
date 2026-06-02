"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({
  rtUpdated,
  demo,
}: {
  rtUpdated?: string | null;
  demo?: boolean;
}) {
  const path = usePathname();

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-8 bg-go-green-dark px-5 text-white shadow-md">
      <Link href="/" className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-go-green-light font-bold text-go-green-dark"
          aria-hidden
        >
          G
        </span>
        <span className="text-lg font-bold tracking-tight">GTA Transit</span>
      </Link>

      <nav className="flex gap-1">
        <Link
          href="/"
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            path === "/"
              ? "bg-white/15 text-white"
              : "text-white/80 hover:bg-white/10 hover:text-white"
          }`}
        >
          Map
        </Link>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {demo && (
          <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-xs font-semibold">
            Demo
          </span>
        )}
        {rtUpdated && (
          <span className="text-xs font-medium text-white/70 tabular-nums">{rtUpdated}</span>
        )}
      </div>
    </header>
  );
}
