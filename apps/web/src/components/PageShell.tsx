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
      <main className="flex flex-1 justify-center p-3 md:p-5">
        <div
          className={`w-full overflow-hidden border border-[#d9d9d9] bg-go-surface shadow-[var(--shadow-panel)] ${
            wide ? "max-w-3xl" : "max-w-xl"
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
