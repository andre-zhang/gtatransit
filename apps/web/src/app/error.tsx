"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-go-bg px-6 text-center">
      <h1 className="text-xl font-bold text-go-navy">Something went wrong</h1>
      <p className="max-w-md text-sm text-go-slate">
        The page hit an unexpected error. Refresh or return to the map to try again.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-sm bg-go-green px-4 py-2 text-sm font-bold text-white"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-sm border border-[#d9d9d9] bg-go-surface px-4 py-2 text-sm font-bold text-go-navy"
        >
          Back to map
        </Link>
      </div>
    </div>
  );
}
