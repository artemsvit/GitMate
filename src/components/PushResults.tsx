import { PushReport, destinationKey } from '../useRepositoryPush';
export function PushResults({ report, busy, retry }: { report: PushReport | null; busy: boolean; retry: () => void }) {
  if (!report) return null;
  const failed = report.results.filter(result => result.status !== 'verified');
  return <div className="text-xs space-y-2 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
    <p className="font-medium text-[var(--text-primary)]">{report.results.length - failed.length}/{report.results.length} destinations verified · {report.commitHash.slice(0, 7)}</p>
    {report.results.map(result => <div key={destinationKey(result.destination)} className="break-words"><span className={result.status === 'verified' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{result.status === 'verified' ? '✓' : '!'} {result.destination.remote}</span><p className="text-[var(--text-muted)] break-all">{result.destination.url}</p><p className="text-[var(--text-muted)]">{result.message}</p></div>)}
    {!!failed.length && <button disabled={busy} onClick={retry} className="px-3 py-1.5 rounded-full border border-[var(--border-interactive)] text-[var(--text-primary)] disabled:opacity-40">Retry failed destinations</button>}
  </div>;
}
