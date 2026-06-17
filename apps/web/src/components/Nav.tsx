"use client";

import Link from "next/link";

export function Nav({
  demo,
}: {
  rtUpdated?: string | null;
  demo?: boolean;
}) {
  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-4 border-b border-[#a61e14] bg-go-green px-4 text-white">
      <Link href="/" className="text-lg font-bold tracking-tight">
        GTA Transit
      </Link>

      <div className="ml-auto flex items-center gap-3">
        {demo && (
          <span className="border border-white/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90">
            Demo
          </span>
        )}
      </div>
    </header>
  );
}
