import { useCallback, useEffect, useState } from 'react';
import { Download, Pause } from 'lucide-react';
import { apiFetch } from '../api';
import { notifyModelChanged } from '../aiEngine';
import { ProgressBar } from './ProgressBar';
import { Dropdown } from './Dropdown';

export interface ModelStatus { id?: string; state: string; downloaded: number; size: number; model: string; label?: string; error?: string }
interface Choice { id: string; label: string; size: number; fits: boolean; summary: string }
const gb = (bytes: number) => (bytes / 1e9).toFixed(2);
const stateText: Record<string, string> = { missing: 'Not downloaded', paused: 'Paused', downloading: 'Downloading', verifying: 'Checking file', error: 'Download failed' };
export const modelReady = (model: ModelStatus | null) => ['ready', 'loaded', 'loading'].includes(model?.state || '');

// Polls the local model status while a component that depends on it is shown.
export function useModelStatus() {
  const [model, setModel] = useState<ModelStatus | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const res = await apiFetch('/api/copilot/model', { signal }); const data = await res.json(); if (res.ok && !signal?.aborted) setModel(data); } catch {}
  }, []);
  useEffect(() => {
    const lifetime = new AbortController(); void refresh(lifetime.signal);
    const timer = setInterval(() => refresh(lifetime.signal), 2000);
    return () => { lifetime.abort(); clearInterval(timer); };
  }, [refresh]);
  return { model, setModel, refresh };
}

interface ListedModel { id: string; label: string; size: number; fits: boolean; summary: string; active: boolean; suggested?: boolean; state: string; downloaded: number; error?: string }

// Shared by Chat and the Commit tab: both run on the same on-device model.
// It reads the whole model list, so a download started in Settings shows its progress here too.
export function ModelSetupCard({ model, onChange, purpose }: { model: ModelStatus | null; onChange: (model: ModelStatus) => void; purpose: 'chat' | 'commit' }) {
  const [error, setError] = useState('');
  const [models, setModels] = useState<ListedModel[]>([]);
  const [choice, setChoice] = useState('');
  const needsSetup = !!model && !modelReady(model) && model.state !== 'unsupported';
  useEffect(() => {
    if (!needsSetup) return;
    let stopped = false;
    const load = () => apiFetch('/api/copilot/models').then(res => res.json()).then(data => {
      if (stopped) return;
      setModels(data.models || []); setChoice(previous => previous || data.models?.find((item: ListedModel) => item.suggested)?.id || '');
    }).catch(() => {});
    void load(); const timer = setInterval(load, 1500);
    return () => { stopped = true; clearInterval(timer); };
  }, [needsSetup]);
  if (!model || modelReady(model)) return null;
  if (model.state === 'unsupported') return <p className="text-[11px] text-pretty text-[var(--text-muted)]">{model.error}</p>;
  const running = models.find(item => ['downloading', 'verifying'].includes(item.state));
  const partial = running || models.find(item => item.downloaded > 0 && !['ready', 'loaded', 'loading'].includes(item.state));
  const post = async (url: string, body?: object) => { const res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; };
  const start = async (id: string) => {
    setError('');
    try {
      await post('/api/copilot/model/download', { id });
      const res = await apiFetch('/api/copilot/model'); onChange(await res.json()); notifyModelChanged();
    } catch (err: any) { setError(err.message || 'The download could not start.'); }
  };
  const pause = async () => { setError(''); try { await post('/api/copilot/model/cancel'); } catch (err: any) { setError(err.message); } };
  const choices = models.filter(item => item.fits);
  const chosen = choices.find(item => item.id === choice);
  return <div className="p-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5 text-xs">
    <div className="space-y-1">
      <p className="font-medium text-balance text-[var(--text-primary)]">{purpose === 'chat' ? 'Set up local Copilot' : 'Better commit messages'}</p>
      <p className="text-[11px] text-pretty text-[var(--text-muted)]">{purpose === 'chat' ? 'Download a model once to chat about your code.' : 'Commit messages use built-in rules until you download a model.'} Everything stays on this Mac.</p>
    </div>
    {partial ? <div className="space-y-1">
      <p className="text-[11px] text-[var(--text-primary)]">{partial.label}</p>
      <ProgressBar label="Model download progress" value={partial.downloaded} max={partial.size} />
      <p className="text-[10px] text-[var(--text-muted)] tabular-nums">{stateText[partial.state] || partial.state} · {gb(partial.downloaded)} / {gb(partial.size)} GB</p>
    </div> : <>
      {choices.length > 0 && <Dropdown label="Model to download" value={choice} onChange={setChoice} options={choices.map(item => ({ value: item.id, label: `${item.label} · ${(item.size / 1e9).toFixed(1)} GB${item.id === 'balanced' ? ' · Recommended' : ''}` }))} />}
      {chosen && <p className="text-[10px] text-[var(--text-muted)] text-pretty">{chosen.summary}</p>}
    </>}
    {(partial?.error || error) && <p className="text-[10px] text-rose-500">{partial?.error || error}</p>}
    <button disabled={!partial && !chosen} onClick={() => running ? pause() : start(partial?.id || choice)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--border-interactive)] text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-40">
      {running ? <><Pause className="size-3" />Pause download</> : <><Download className="size-3" />{partial ? 'Resume download' : 'Download'}</>}
    </button>
  </div>;
}
