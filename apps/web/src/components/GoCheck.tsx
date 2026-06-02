export function GoCheck({
  checked,
  onChange,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`go-check ${className}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="go-check-box" aria-hidden />
      <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-go-navy">
        {label}
      </span>
    </label>
  );
}
