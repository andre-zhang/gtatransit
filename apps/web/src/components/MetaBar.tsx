import Link from "next/link";

type Item = { label: string; href: string };

export function MetaBar({ items }: { items: Item[] }) {
  if (!items.length) return null;

  return (
    <div className="go-meta-bar">
      {items.map((item, i) => (
        <span key={item.href} className="inline-flex items-center gap-2">
          {i > 0 && <span className="text-go-bg" aria-hidden>|</span>}
          <Link href={item.href} className="go-link">
            {item.label}
          </Link>
        </span>
      ))}
    </div>
  );
}
