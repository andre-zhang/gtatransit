"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body className="min-h-screen bg-[#f4f4f4] font-sans text-[#1c2840]">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-bold">GTA Transit</h1>
          <p className="max-w-md text-sm text-[#5c677d]">
            Something went wrong loading the app. This can happen after a deploy — refresh to
            load the latest version.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-sm bg-[#007934] px-4 py-2 text-sm font-bold text-white"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
