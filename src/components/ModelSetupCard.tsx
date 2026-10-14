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

// Shared by Chat and the Commit tab: both run on the same on-device model.
export function ModelSetupCard({ model, onChange, purpose }: { model: ModelStatus | null; onChange: (model: ModelStatus) => void; purpose: 'chat' | 'commit' }) {
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [choice, setChoice] = useState('');
  const needsSetup = !!model && !modelReady(model) && model.state !== 'unsupported';
  useEffect(() => {
    if (!needsSetup) return;
    apiFetch('/api/copilot/models').then(res => res.json()).then(data => { setChoices((data.models || []).filter((item: Choice) => item.fits)); setChoice(previous => previous || data.active); }).catch(() => {});
  }, [needsSetup]);
  if (!model || modelReady(model)) return null;
  if (model.state === 'unsupported') return <p className="text-[11px] text-pretty text-[var(--text-muted)]">{model.error}</p>;
  const active = ['downloading', 'verifying'].includes(model.state);
  const started = active || model.downloaded > 0;
  const post = async (url: string, body?: object) => { const res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; };
  const start = async () => {
    setError('');
    try {
      // The chosen model becomes the active one, then its download starts.
      if (choice && choice !== model.id) await post('/api/copilot/model/select', { id: choice });
      await post('/api/copilot/model/download');
      const res = await apiFetch('/api/copilot/model'); onChange(await res.json()); notifyModelChanged();
    } catch (err: any) { setError(err.message || 'The download could not start.'); }
  };
  const pause = async () => { setError(''); try { await post('/api/copilot/model/cancel'); } catch (err: any) { setError(err.message); } };
  return <div className="p-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5 text-xs">
    <div className="space-y-1">
      <p className="font-medium text-balance text-[var(--text-primary)]">{purpose === 'chat' ? 'Set up local Copilot' : 'Better commit messages'}</p>
      <p className="text-[11px] text-pretty text-[var(--text-muted)]">{purpose === 'chat' ? 'Download a model once to chat about your code.' : 'Commit messages use built-in rules until you download a model.'} Everything stays on this Mac.</p>
    </div>
    {started ? <div className="space-y-1">
      <p className="text-[11px] text-[var(--text-primary)]">{model.label}</p>
      <ProgressBar label="Model download progress" value={model.downloaded} max={model.size} />
      <p className="text-[10px] text-[var(--text-muted)] tabular-nums">{stateText[model.state] || model.state} · {gb(model.downloaded)} / {gb(model.size)} GB</p>
    </div> : choices.length > 0 && <Dropdown label="Model to download" value={choice} onChange={setChoice} options={choices.map(item => ({ value: item.id, label: `${item.label} · ${(item.size / 1e9).toFixed(1)} GB${item.id === 'balanced' ? ' · Recommended' : ''}` }))} />}
    {!started && choices.find(item => item.id === choice) && <p className="text-[10px] text-[var(--text-muted)] text-pretty">{choices.find(item => item.id === choice)!.summary}</p>}
    {(model.error || error) && <p className="text-[10px] text-rose-500">{model.error || error}</p>}
    <button onClick={() => active ? pause() : start()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--border-interactive)] text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-card)]">
      {active ? <><Pause className="size-3" />Pause download</> : <><Download className="size-3" />{model.downloaded ? 'Resume download' : 'Download'}</>}
    </button>
  </div>;
}
