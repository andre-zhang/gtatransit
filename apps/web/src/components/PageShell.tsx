import { Nav } from "./Nav";

export function PageShell({
  children,
  rtUpdated,
  demo,
  wide = true,
}: {
  children: React.ReactNode;
  rtUpdated?: string | null;
  demo?: boolean;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-go-bg">
      <Nav rtUpdated={rtUpdated} demo={demo} />
      <main className="flex flex-1 justify-center p-0 sm:p-3 md:p-5">
        <div
          className={`w-full overflow-hidden bg-go-surface sm:border sm:border-[#d9d9d9] sm:shadow-[var(--shadow-panel)] ${
            wide ? "max-w-3xl" : "max-w-xl"
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
