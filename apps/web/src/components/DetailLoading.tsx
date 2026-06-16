export function DetailLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <>
      <div className="border-b-4 border-go-green-dark bg-go-green px-5 pb-5 pt-4 text-white">
        <div className="inline-flex min-h-11 items-center text-sm font-semibold text-white/90">
          Map
        </div>
        <div className="mt-3 h-7 w-2/3 max-w-xs animate-pulse rounded bg-white/20" />
        <p className="mt-3 text-sm font-medium text-white/90">{message}</p>
      </div>
      <div className="space-y-3 px-5 py-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-4 w-14 shrink-0 animate-pulse rounded bg-go-bg" />
            <div className="h-4 flex-1 animate-pulse rounded bg-go-bg" />
          </div>
        ))}
      </div>
    </>
  );
}
