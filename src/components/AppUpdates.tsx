import { useEffect, useState } from 'react';
import type { UpdateState } from './UpdateWindow';

export function AppUpdates() {
  const api = (window as any).electronAPI;
  const [state, setState] = useState<UpdateState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api?.getUpdateState().then(setState).catch(() => {}); return api?.onUpdateState(setState); }, [api]);
  const run = async (action: () => Promise<any>) => { setError(''); try { const next = await action(); if (next) setState(next); } catch (err: any) { setError(err.message || 'The update action failed.'); } };
  const busy = state?.status === 'checking' || state?.status === 'downloading';
  const label = state?.status === 'downloaded' ? 'Install and Relaunch…' : state?.status === 'available' ? 'View Update…' : 'Check for Updates…';
  return <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3">
    <div>
      <h4 className="font-semibold text-xs text-[var(--text-primary)]">Software update</h4>
      <p role="status" className="text-[10px] text-[var(--text-muted)]">{state ? state.message : 'Updates are available in the installed app.'}</p>
    </div>
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
        <input type="checkbox" disabled={!api} checked={!!state?.autoDownload} onChange={event => run(() => api.setAutoDownload(event.target.checked))} className="accent-[var(--accent-violet)]" />
        Download updates automatically
      </label>
      <button disabled={!api || busy} onClick={() => run(() => api.checkUpdatesInteractive())} className="px-3 py-1.5 rounded-full border border-[var(--border-interactive)] text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)] disabled:opacity-40">{label}</button>
    </div>
    {error && <p role="alert" className="text-[10px] text-rose-500">{error}</p>}
  </div>;
}
