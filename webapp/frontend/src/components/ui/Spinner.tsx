export function Spinner({
  size = 24,
  label,
  className = '',
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`inline-flex flex-col items-center gap-2 ${className}`} role="status">
      <span
        className="inline-block animate-spin rounded-full border-[3px] border-primary/25 border-t-primary"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
      {label ? <span className="text-[11px] font-medium text-ink-muted">{label}</span> : null}
      <span className="sr-only">در حال بارگذاری</span>
    </div>
  );
}
