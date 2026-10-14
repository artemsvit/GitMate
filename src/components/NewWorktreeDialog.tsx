import { useEffect, useMemo, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { cn } from '../cn';
import { apiFetch } from '../api';
import { Dropdown } from './Dropdown';
import type { Worktree } from '../types';

// Creates a linked worktree: a second folder with its own branch, sharing this repository's history.
export function NewWorktreeDialog({ open, repoPath, repoName, mainPath, currentBranch, localBranches, worktrees, onClose, onCreated }: {
  open: boolean; repoPath: string; repoName: string; mainPath: string; currentBranch: string; localBranches: string[]; worktrees: Worktree[];
  onClose: () => void; onCreated: (path: string) => void;
}) {
  const busyBranches = useMemo(() => new Set(worktrees.map(entry => entry.branch).filter(Boolean)), [worktrees]);
  const free = localBranches.filter(name => !busyBranches.has(name));
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [branch, setBranch] = useState('');
  const [existing, setExisting] = useState('');
  const [folder, setFolder] = useState('');
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const chosen = mode === 'new' ? branch.trim() : existing;
  // Default location: a sibling folder next to the repository, never inside it.
  const parent = mainPath.slice(0, mainPath.lastIndexOf('/'));
  const suggested = `${parent}/${repoName}-worktrees/${(chosen || 'worktree').replace(/[^A-Za-z0-9._-]+/g, '-')}`;
  useEffect(() => { if (open) { setMode('new'); setBranch(''); setExisting(free[0] || ''); setEdited(false); setError(''); } }, [open]);
  useEffect(() => { if (!edited) setFolder(suggested); }, [suggested, edited]);
  if (!open) return null;
  const choose = async () => {
    const picked = await (window as any).electronAPI?.selectFolder(parent).catch(() => null);
    if (picked) { setFolder(`${picked}/${(chosen || repoName).replace(/[^A-Za-z0-9._-]+/g, '-')}`); setEdited(true); }
  };
  const create = async () => {
    setBusy(true); setError('');
    try {
      const res = await apiFetch('/api/repos/worktrees/create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath, target: folder.trim(), branch: chosen, newBranch: mode === 'new', base: mode === 'new' ? currentBranch : undefined }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      onCreated(data.result.path);
    } catch (err: any) { setError(err.message || 'Could not create the worktree.'); } finally { setBusy(false); }
  };
  const tab = (value: 'new' | 'existing', label: string) => <button type="button" onClick={() => setMode(value)} aria-pressed={mode === value}
    className={cn('flex-1 px-3 py-1.5 rounded-full text-[11px] transition', mode === value ? 'bg-[var(--bg-card)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>{label}</button>;
  return <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="new-worktree-title" onClick={event => event.stopPropagation()} className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl shadow-2xl text-xs p-5 space-y-4">
      <div>
        <h3 id="new-worktree-title" className="text-sm font-semibold text-[var(--text-primary)]">New worktree</h3>
        <p className="text-[11px] text-[var(--text-muted)] mt-1 text-pretty">A second folder with its own branch. You can work in both at once; they share this repository’s history.</p>
      </div>
      <div className="flex gap-1 p-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">{tab('new', 'New branch')}{tab('existing', 'Existing branch')}</div>
      {mode === 'new' ? <label className="block space-y-1">
        <span className="text-[10px] text-[var(--text-muted)]">Branch name · starts from {currentBranch}</span>
        <input autoFocus value={branch} onChange={event => setBranch(event.target.value)} placeholder="feature/new-idea" className="w-full bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]" />
      </label> : <div className="space-y-1">
        <span className="block text-[10px] text-[var(--text-muted)]">Branch · branches open in another worktree are not listed</span>
        {free.length ? <Dropdown label="Existing branch" value={existing} onChange={setExisting} options={free.map(name => ({ value: name, label: name }))} /> : <p className="text-[11px] text-[var(--text-muted)]">Every local branch is already open in a worktree.</p>}
      </div>}
      <div className="space-y-1">
        <span className="block text-[10px] text-[var(--text-muted)]">Folder</span>
        <div className="flex gap-1.5">
          <input value={folder} onChange={event => { setFolder(event.target.value); setEdited(true); }} aria-label="Worktree folder" className="flex-1 min-w-0 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 font-mono text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]" />
          <button type="button" onClick={choose} aria-label="Choose folder" className="px-2.5 rounded-xl border border-[var(--border-interactive)] hover:bg-[var(--bg-card)]"><FolderOpen className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {error && <p role="alert" className="text-[11px] text-rose-500 text-pretty">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3.5 py-1.5 rounded-full border border-[var(--border-interactive)] hover:bg-[var(--bg-card)]">Cancel</button>
        <button type="button" disabled={busy || !chosen || !folder.trim()} onClick={create} className="px-3.5 py-1.5 rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-medium disabled:opacity-40">{busy ? 'Creating…' : 'Create and Open'}</button>
      </div>
    </div>
  </div>;
}
