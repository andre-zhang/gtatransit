export function PageLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-go-bg">
      <header className="flex h-12 shrink-0 items-center border-b border-[#a61e14] bg-go-green px-4">
        <div className="h-5 w-28 rounded bg-white/20" />
      </header>
      <main className="flex flex-1 justify-center p-0 sm:p-3 md:p-5">
        <div className="w-full max-w-3xl overflow-hidden bg-go-surface sm:border sm:border-[#d9d9d9]">
          <div className="border-b border-go-bg px-5 py-4">
            <div className="h-7 w-2/3 max-w-xs animate-pulse rounded bg-go-bg" />
            <div className="mt-2 h-4 w-1/3 max-w-[8rem] animate-pulse rounded bg-go-bg" />
          </div>
          <div className="space-y-3 px-5 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-4 w-14 shrink-0 animate-pulse rounded bg-go-bg" />
                <div className="h-4 flex-1 animate-pulse rounded bg-go-bg" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
