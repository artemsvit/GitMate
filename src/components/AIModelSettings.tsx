import { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, Download, HardDrive, Pause, RefreshCw, Server, Trash2, Check } from 'lucide-react';
import { cn } from '../cn';
import { Dropdown } from './Dropdown';
import { apiFetch } from '../api';
import { LocalAIStatus } from '../types';
import { friendlyModelName, notifyModelChanged, readAIMode, readExternalChoice, setAIMode, setExternalChoice, type AIMode, type ExternalChoice } from '../aiEngine';

interface LocalModel { id: string; label: string; size: number; summary: string; minMemoryGB: number; fits: boolean; active: boolean; state: string; downloaded: number; error?: string }
interface ModelList { memoryGB: number; active: string; supported: boolean; models: LocalModel[] }
const gb = (bytes: number) => (bytes / 1e9).toFixed(1);
const providerName = { lmstudio: 'LM Studio', ollama: 'Ollama' } as const;

export function AIModelSettings({ onChanged }: { onChanged: () => void }) {
  const [mode, setMode] = useState<AIMode>(readAIMode);
  const [list, setList] = useState<ModelList | null>(null);
  const [status, setStatus] = useState<LocalAIStatus | null>(null);
  const [external, setExternal] = useState<ExternalChoice | null>(readExternalChoice);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadModels = useCallback(async () => {
    try { const res = await apiFetch('/api/copilot/models'); if (res.ok) setList(await res.json()); } catch {}
  }, []);
  const loadExternal = useCallback(async () => {
    setChecking(true);
    try { const res = await apiFetch('/api/ai/status?mode=external'); if (res.ok) setStatus(await res.json()); } catch {} finally { setChecking(false); }
  }, []);
  useEffect(() => { void loadModels(); void loadExternal(); }, [loadModels, loadExternal]);
  const busy = list?.models.some(model => ['downloading', 'verifying'].includes(model.state));
  useEffect(() => { if (!busy) return; const timer = setInterval(loadModels, 1500); return () => clearInterval(timer); }, [busy, loadModels]);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  const call = async (url: string, method: string, body?: object) => {
    setError('');
    try {
      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      await loadModels(); notifyModelChanged(); onChanged();
    } catch (err: any) { setError(err.message || 'The action failed.'); }
  };
  const chooseMode = (next: AIMode) => { setMode(next); setAIMode(next); onChanged(); };
  const chooseExternal = (value: string) => {
    const [provider, ...rest] = value.split('::'); const choice = { provider, model: rest.join('::') } as ExternalChoice;
    setExternal(choice); setExternalChoice(choice); onChanged();
  };
  const askDelete = (id: string) => {
    if (confirmDelete === id) { setConfirmDelete(''); void call('/api/copilot/model', 'DELETE', { id }); return; }
    setConfirmDelete(id); clearTimeout(confirmTimer.current); confirmTimer.current = setTimeout(() => setConfirmDelete(''), 4000);
  };
  const sources = status?.externalSources || [];
  const selectedExternal = external && sources.some(source => source.provider === external.provider && source.models.includes(external.model)) ? `${external.provider}::${external.model}` : '';

  const sourceCard = (value: AIMode, title: string, text: string, Icon: typeof Cpu) => (
    <button type="button" onClick={() => chooseMode(value)} aria-pressed={mode === value} className={cn('p-3 rounded-xl border text-left transition cursor-pointer space-y-1.5',
      mode === value ? 'border-[var(--accent-violet)] bg-[var(--accent-violet)]/10 ring-1 ring-[var(--accent-violet)]' : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-interactive)]')}>
      <span className="flex items-center gap-2 font-semibold text-xs text-[var(--text-primary)]"><Icon className="size-3.5 text-[var(--accent-violet)]" />{title}</span>
      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed text-pretty">{text}</p>
    </button>
  );

  return <div className="space-y-4">
    <section className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3">
      <div>
        <h4 className="font-semibold text-xs text-[var(--text-primary)]">AI source</h4>
        <p className="text-[10px] text-[var(--text-muted)] text-pretty">Used for Copilot Chat and commit messages.</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {sourceCard('embedded', 'Git Mate Local AI', 'Models that run on this Mac. Private and offline after one download.', HardDrive)}
        {sourceCard('external', 'LM Studio / Ollama', 'Use a model you already run in LM Studio or Ollama on this Mac.', Server)}
      </div>
    </section>

    <section className={cn('p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3', mode !== 'embedded' && 'opacity-80')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-xs text-[var(--text-primary)]">Local AI models</h4>
          <p className="text-[10px] text-[var(--text-muted)] text-pretty">Stored in ~/.gitmate/models.{list ? ` This Mac has ${list.memoryGB} GB memory.` : ''}</p>
        </div>
      </div>
      {list && !list.supported && <p className="text-[11px] text-[var(--text-muted)]">Local AI models require macOS 14 or newer.</p>}
      <ul className="space-y-2">
        {list?.models.map(model => {
          const downloading = ['downloading', 'verifying'].includes(model.state);
          const installed = ['ready', 'loaded', 'loading'].includes(model.state);
          return <li key={model.id} className={cn('p-3 rounded-xl border bg-[var(--bg-canvas)] space-y-2', model.active ? 'border-[var(--accent-violet)]' : 'border-[var(--border-subtle)]')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                  {model.label}
                  {model.id === 'balanced' && <span className="text-[9px] font-normal px-1.5 py-0.5 rounded-full border border-[var(--border-interactive)] text-[var(--text-muted)]">Recommended</span>}
                  {model.active && <span className="flex items-center gap-1 text-[9px] font-normal px-1.5 py-0.5 rounded-full bg-[var(--accent-violet)]/15 text-[var(--accent-violet)]"><Check className="size-2.5" />In use</span>}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] text-pretty mt-0.5">{model.summary}</p>
                <p className="text-[10px] text-[var(--text-dim)] tabular-nums mt-0.5">{gb(model.size)} GB · needs {model.minMemoryGB} GB memory{installed ? ' · Downloaded' : ''}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {installed && !model.active && model.fits && <button type="button" onClick={() => call('/api/copilot/model/select', 'POST', { id: model.id })} className="px-2.5 py-1 rounded-full border border-[var(--border-interactive)] text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-surface)]">Use</button>}
                {!installed && !downloading && <button type="button" disabled={!model.fits || !!busy || !list.supported} title={model.fits ? undefined : `Needs a Mac with ${model.minMemoryGB} GB memory`} onClick={() => call('/api/copilot/model/download', 'POST', { id: model.id })} className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--border-interactive)] text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] disabled:opacity-40"><Download className="size-3" />{model.downloaded ? 'Resume' : 'Download'}</button>}
                {downloading && <button type="button" onClick={() => call('/api/copilot/model/cancel', 'POST')} className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--border-interactive)] text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"><Pause className="size-3" />Pause</button>}
                {(installed || (model.downloaded > 0 && !downloading)) && <button type="button" onClick={() => askDelete(model.id)} aria-label={`Delete ${model.label}`} className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-[11px] transition', confirmDelete === model.id ? 'bg-rose-600 text-white' : 'text-[var(--text-muted)] hover:text-rose-500')}><Trash2 className="size-3" />{confirmDelete === model.id ? 'Confirm' : ''}</button>}
              </div>
            </div>
            {(downloading || (model.downloaded > 0 && !installed)) && <div className="space-y-1">
              <progress aria-label={`${model.label} download progress`} className="w-full h-1.5 accent-[var(--accent-violet)]" value={model.downloaded} max={model.size} />
              <p className="text-[10px] text-[var(--text-muted)] tabular-nums">{model.state === 'verifying' ? 'Checking file…' : model.state === 'downloading' ? 'Downloading' : 'Paused'} · {gb(model.downloaded)} / {gb(model.size)} GB</p>
            </div>}
            {!model.fits && <p className="text-[10px] text-[var(--text-muted)]">This Mac has {list.memoryGB} GB memory, so this model is not available.</p>}
            {model.error && <p className="text-[10px] text-rose-500">{model.error}</p>}
          </li>;
        })}
      </ul>
      <p className="text-[10px] text-[var(--text-muted)] text-pretty">Without a downloaded model, commit messages come from Git Mate's built-in rules.</p>
    </section>

    <section className={cn('p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3', mode !== 'external' && 'opacity-80')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-xs text-[var(--text-primary)]">LM Studio / Ollama</h4>
          <p className="text-[10px] text-[var(--text-muted)] text-pretty">Git Mate connects only to 127.0.0.1 on ports 1234 (LM Studio) and 11434 (Ollama).</p>
        </div>
        <button type="button" onClick={loadExternal} disabled={checking} className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--border-interactive)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-50"><RefreshCw className={cn('size-3', checking && 'animate-spin')} />Refresh</button>
      </div>
      {sources.length ? <div className="space-y-1">
        <span className="block text-[10px] text-[var(--text-muted)]">Model</span>
        <Dropdown label="LM Studio or Ollama model" value={selectedExternal} onChange={chooseExternal} placeholder="Choose a model" options={sources.flatMap(source => source.models.map(model => ({
          value: `${source.provider}::${model}`, label: `${friendlyModelName(model)} · ${model}`, group: providerName[source.provider]
        })))} />
      </div> : <p className="text-[11px] text-[var(--text-muted)] text-pretty">{checking ? 'Looking for LM Studio and Ollama…' : 'No running server found. In LM Studio, load a model and start the local server (Developer → Start Server). For Ollama, run it and pull a model. Then press Refresh.'}</p>}
      {mode === 'external' && sources.length > 0 && !selectedExternal && <p className="text-[10px] text-amber-500">Choose a model to use LM Studio or Ollama.</p>}
    </section>
    {error && <p role="alert" className="text-[11px] text-rose-500">{error}</p>}
  </div>;
}
