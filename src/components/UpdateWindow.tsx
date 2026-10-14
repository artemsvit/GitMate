import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../cn';
import { ProgressBar } from './ProgressBar';

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'current' | 'error';
  message: string; current: string; version?: string; releaseName?: string; releaseDate?: string; releaseNotes?: string;
  percent?: number; transferred?: number; total?: number; bytesPerSecond?: number; autoDownload?: boolean; skipped?: string | null;
}

// Release notes come from GitHub as HTML. Only these tags are rebuilt as React elements; everything else becomes text.
const allowed = new Set(['p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'code', 'pre', 'a', 'br', 'blockquote']);
function toReact(node: Node, key: number): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as Element; const tag = element.tagName.toLowerCase();
  if (['script', 'style', 'iframe', 'object', 'template'].includes(tag)) return null;
  const children = [...element.childNodes].map(toReact);
  if (!allowed.has(tag)) return <React.Fragment key={key}>{children}</React.Fragment>;
  if (tag === 'a') { const href = element.getAttribute('href') || ''; return /^https:\/\//.test(href) ? <a key={key} href={href} target="_blank" rel="noreferrer">{children}</a> : <span key={key}>{children}</span>; }
  if (tag === 'h1' || tag === 'h2') return <h3 key={key}>{children}</h3>;
  return React.createElement(tag, { key }, children.length ? children : undefined);
}
function ReleaseNotes({ html }: { html: string }) {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  return <>{[...body.childNodes].map(toReact)}</>;
}

const megabytes = (bytes = 0) => `${(bytes / 1e6).toFixed(1)} MB`;
const button = 'px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer disabled:opacity-40';

export function UpdateWindow() {
  const api = (window as any).electronAPI;
  const [state, setState] = useState<UpdateState | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!api?.onUpdatePrompt) return;
    api.getUpdateState?.().then(setState).catch(() => {});
    const offState = api.onUpdateState((next: UpdateState) => setState(next));
    const offPrompt = api.onUpdatePrompt((next: UpdateState) => { setState(next); setError(''); setOpen(true); });
    return () => { offState?.(); offPrompt?.(); };
  }, [api]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open || !state) return null;
  const run = async (action: () => Promise<any>, close = false) => {
    setError('');
    try { const next = await action(); if (next) setState(next); if (close) setOpen(false); } catch (err: any) { setError(err.message || 'The update action failed.'); }
  };
  const date = state.releaseDate ? new Date(state.releaseDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const titles: Record<UpdateState['status'], string> = {
    idle: 'Software Update', checking: 'Checking for updates…', available: 'A new version of Git Mate is available',
    downloading: `Downloading Git Mate ${state.version || ''}`, downloaded: 'Ready to install', current: 'You’re up to date', error: 'Update failed'
  };
  const subtitles: Record<UpdateState['status'], string> = {
    idle: state.message, checking: 'Git Mate is looking for a newer version.',
    available: `Git Mate ${state.version} is available. You have ${state.current}.`,
    downloading: state.total ? `${megabytes(state.transferred)} of ${megabytes(state.total)}${state.bytesPerSecond ? ` · ${megabytes(state.bytesPerSecond)}/s` : ''}` : 'Starting download…',
    downloaded: `Git Mate ${state.version} is downloaded. Relaunch to finish, or it installs the next time you quit.`,
    current: `Git Mate ${state.current} is the newest version available.`, error: state.message
  };

  return <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setOpen(false)}>
    <div role="dialog" aria-modal="true" aria-labelledby="update-title" onClick={event => event.stopPropagation()} className="w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl shadow-2xl text-xs overflow-hidden">
      <div className="p-6 flex items-start gap-4">
        <img src="/icon.png" alt="" className="size-14 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 pt-1">
          <h2 id="update-title" className="text-sm font-semibold text-[var(--text-primary)] text-balance flex items-center gap-2">{state.status === 'checking' && <Loader2 className="size-3.5 animate-spin text-[var(--accent-violet)]" />}{titles[state.status]}</h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-1 text-pretty tabular-nums">{subtitles[state.status]}</p>
          {state.status === 'downloading' && <ProgressBar label="Download progress" value={state.percent || 0} className="mt-3" />}
        </div>
      </div>

      {(state.status === 'available' || state.status === 'downloaded') && <div className="px-6">
        <div className="flex items-baseline justify-between mb-1.5">
          <h3 className="text-[11px] font-semibold text-[var(--text-primary)]">Release notes{state.releaseName && state.releaseName !== `v${state.version}` ? ` · ${state.releaseName}` : ''}</h3>
          {date && <span className="text-[10px] text-[var(--text-muted)]">{date}</span>}
        </div>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-3 text-[11px] leading-relaxed text-[var(--text-secondary)] [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-[var(--text-primary)] [&_h3]:mt-3 [&_h3:first-child]:mt-0 [&_h4]:font-semibold [&_h4]:mt-2 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_a]:text-[var(--accent-violet)] [&_a]:underline [&_code]:font-mono [&_code]:text-[10px] [&_pre]:whitespace-pre-wrap">
          {state.releaseNotes?.trim() ? <ReleaseNotes html={state.releaseNotes} /> : <p className="text-[var(--text-muted)]">No release notes were published for this version.</p>}
        </div>
      </div>}

      {state.status === 'available' && <label className="px-6 pt-3 flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
        <input type="checkbox" checked={!!state.autoDownload} onChange={event => run(() => api.setAutoDownload(event.target.checked))} className="accent-[var(--accent-violet)]" />
        Download updates automatically in the future
      </label>}
      {error && <p role="alert" className="px-6 pt-3 text-[11px] text-rose-500">{error}</p>}

      <div className="px-6 py-5 flex items-center gap-2">
        {state.status === 'available' && <>
          <button className={cn(button, 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')} onClick={() => run(() => api.skipUpdate(), true)}>Skip This Version</button>
          <span className="flex-1" />
          <button className={cn(button, 'border border-[var(--border-interactive)] text-[var(--text-primary)] hover:bg-[var(--bg-card)]')} onClick={() => setOpen(false)}>Remind Me Later</button>
          <button className={cn(button, 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:opacity-90')} onClick={() => run(() => api.downloadUpdate())}>Install Update</button>
        </>}
        {state.status === 'downloading' && <><span className="flex-1" /><button className={cn(button, 'border border-[var(--border-interactive)] text-[var(--text-primary)] hover:bg-[var(--bg-card)]')} onClick={() => setOpen(false)}>Continue in Background</button></>}
        {state.status === 'downloaded' && <>
          <span className="flex-1" />
          <button className={cn(button, 'border border-[var(--border-interactive)] text-[var(--text-primary)] hover:bg-[var(--bg-card)]')} onClick={() => setOpen(false)}>Install on Quit</button>
          <button className={cn(button, 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:opacity-90')} onClick={() => run(() => api.installUpdate())}>Install and Relaunch</button>
        </>}
        {state.status === 'error' && <>
          <span className="flex-1" />
          <button className={cn(button, 'border border-[var(--border-interactive)] text-[var(--text-primary)] hover:bg-[var(--bg-card)]')} onClick={() => setOpen(false)}>Close</button>
          <button className={cn(button, 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:opacity-90')} onClick={() => run(() => api.checkUpdatesInteractive())}>Try Again</button>
        </>}
        {['current', 'checking', 'idle'].includes(state.status) && <><span className="flex-1" /><button className={cn(button, 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:opacity-90')} onClick={() => setOpen(false)}>OK</button></>}
      </div>
    </div>
  </div>;
}
