import { Nav } from "./Nav";

export function PageShell({
  children,
  rtUpdated,
}: {
  children: React.ReactNode;
  rtUpdated?: string | null;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-go-bg">
      <Nav rtUpdated={rtUpdated} />
      <main className="flex flex-1 justify-center p-4 md:p-6">
        <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-go-surface shadow-[var(--shadow-panel)]">
          {children}
        </div>
      </main>
    </div>
  );
}
