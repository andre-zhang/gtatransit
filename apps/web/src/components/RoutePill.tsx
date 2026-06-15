import Link from "next/link";

function contrastText(hex: string): string {
  const h = hex.replace(/^#/, "");
  if (h.length < 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#1c2840" : "#fff";
}

export function RoutePill({
  shortName,
  color,
  textColor,
  size = "md",
  href,
}: {
  shortName: string;
  color: string;
  textColor?: string;
  size?: "md" | "lg";
  href?: string;
}) {
  const bg = color.startsWith("#") ? color : `#${color}`;
  const sizes =
    size === "lg"
      ? "min-w-[2.75rem] px-2.5 py-1 text-base"
      : "min-w-[2.25rem] px-2 py-0.5 text-sm";

  const pill = (
    <span
      className={`inline-flex items-center justify-center rounded-sm font-bold ${sizes} ${
        href ? "transition hover:brightness-95" : ""
      }`}
      style={{
        backgroundColor: bg,
        color: textColor ?? contrastText(bg),
      }}
    >
      {shortName}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="shrink-0" title={`Route ${shortName}`}>
        {pill}
      </Link>
    );
  }

  return pill;
}
