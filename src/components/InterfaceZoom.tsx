import { useEffect, useState } from 'react';
export function InterfaceZoom() {
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState('');
  const api = (window as any).electronAPI;
  useEffect(() => {
    api?.getZoom().then(setZoom).catch(() => setError('Could not read interface zoom.'));
    return api?.onZoomChanged(setZoom);
  }, [api]);
  return <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3">
    <h4 className="font-semibold text-xs text-[var(--text-primary)]">Interface zoom</h4>
    <p className="text-[10px] text-[var(--text-muted)]">Cmd− smaller · Cmd+ larger · Cmd0 default</p>
    <div className="flex flex-wrap gap-2">{[80, 90, 100, 110, 125].map(value => <button key={value} disabled={!api} aria-pressed={zoom === value} onClick={() => api.setZoom(value).then(setZoom).catch((error: Error) => setError(error.message))} className={`rounded-full px-3 py-1.5 text-xs border ${zoom === value ? 'border-[var(--accent-violet)] text-[var(--accent-violet)]' : 'border-[var(--border-interactive)] text-[var(--text-primary)]'} disabled:opacity-40`}>{value}%{value === 100 ? ' · Default' : ''}</button>)}</div>
    {!api && <p className="text-xs text-[var(--text-muted)]">Use browser zoom here. These settings apply in the desktop app.</p>}
    {error && <p className="text-xs text-rose-600">{error}</p>}
  </div>;
}
