import { useEffect, useState } from 'react';
export function AppUpdates() {
  const [state, setState] = useState({ status: 'idle', message: 'Check for a newer Gitler version.' });
  const api = (window as any).electronAPI;
  useEffect(() => { api?.getUpdateState().then(setState).catch(() => {}); return api?.onUpdateState(setState); }, [api]);
  const action = async () => {
    try { const result = await (state.status === 'downloaded' ? api.installUpdate() : state.status === 'available' ? api.downloadUpdate() : api.checkUpdates()); if (result) setState(result); }
    catch (error: any) { setState({ status: 'error', message: error.message || 'Could not complete the update.' }); }
  };
  return <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3"><h4 className="font-semibold text-xs text-[var(--text-primary)]">Application updates</h4><p role="status" className="text-xs text-[var(--text-muted)]">{state.message}</p><button disabled={!api || ['checking', 'downloading'].includes(state.status)} onClick={action} className="px-3 py-1.5 rounded-full border border-[var(--border-interactive)] text-xs text-[var(--text-primary)] disabled:opacity-40">{state.status === 'downloaded' ? 'Restart & Install' : state.status === 'available' ? 'Download Update' : 'Check for Updates'}</button></div>;
}
