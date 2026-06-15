export function PageEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="go-empty">
      <p className="go-empty-title">{title}</p>
      {hint ? <p className="go-empty-hint">{hint}</p> : null}
    </div>
  );
}
