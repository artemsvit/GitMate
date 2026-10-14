// Themed progress bar; the native <progress> element ignores the app's colors on macOS.
export function ProgressBar({ value, max = 100, label, className = '' }: { value: number; max?: number; label: string; className?: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className={`h-1.5 w-full rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden ${className}`}>
    <div className="h-full rounded-full bg-[var(--accent-violet)] transition-[width] duration-300" style={{ width: `${percent}%` }} />
  </div>;
}
