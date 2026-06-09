import { Nav } from "./Nav";

export function PageShell({
  children,
  rtUpdated,
  wide = false,
}: {
  children: React.ReactNode;
  rtUpdated?: string | null;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-go-bg">
      <Nav rtUpdated={rtUpdated} />
      <main className="flex flex-1 justify-center p-4 md:p-6">
        <div
          className={`w-full overflow-hidden rounded-2xl bg-go-surface shadow-[var(--shadow-panel)] ${
            wide ? "max-w-3xl" : "max-w-xl"
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
