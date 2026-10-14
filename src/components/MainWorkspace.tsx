import { useRepositoryPush, destinationKey } from '../useRepositoryPush';
import { PushResults } from './PushResults';
import { Dropdown } from './Dropdown';
import { apiFetch } from '../api';
import React, { useState, useEffect, useRef } from 'react';
import {
  GitBranch,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  FolderGit2,
  FileEdit,
  History,
  Layers,
  CheckSquare,
  Square,
  Copy,
  Check,
  Plus,
  ChevronDown,
  AlertCircle,
  Globe,
  GitFork,
  RotateCcw,
  Archive,
  Trash2,
  GitMerge,
  AlertTriangle
} from 'lucide-react';
import { RepoDetails, RepoSummary } from '../types';
import { GitGraph } from './GitGraph';
import { ConfirmDialog } from './ConfirmDialog';
import { NewWorktreeDialog } from './NewWorktreeDialog';
import type { ActionResult } from '../types';
import { DiffViewer } from './DiffViewer';

interface MainWorkspaceProps {
  syncRemote: string;
  pushState: ReturnType<typeof useRepositoryPush>;
  onSyncTargetChange: (remote: string, pushIndex: number) => void;
  repoSummary: RepoSummary;
  onRefreshParent: () => void;
  selectedFile: string | null;
  onSelectFile: (file: string, isStaged: boolean) => void;
  selectedDiffStaged: boolean;
  onDetailsUpdated: (details: RepoDetails) => void;
  onOpenRemoteAuth?: () => void;
  onOpenRepository?: (path: string) => void;
}

export const MainWorkspace: React.FC<MainWorkspaceProps> = ({
  repoSummary,
  syncRemote, pushState, onSyncTargetChange,
  onRefreshParent,
  selectedFile,
  onSelectFile,
  selectedDiffStaged,
  onDetailsUpdated,
  onOpenRemoteAuth,
  onOpenRepository
}) => {
  const [details, setDetails] = useState<RepoDetails | null>(null);
  const [activeTab, setActiveTab] = useState<'changes' | 'history' | 'branches' | 'graph'>('changes');
  useEffect(() => {
    const switchTab = (event: Event) => { const tab = (event as CustomEvent).detail; if (['changes', 'history', 'branches', 'graph'].includes(tab)) setActiveTab(tab); };
    window.addEventListener('gitmate-workspace-tab', switchTab); return () => window.removeEventListener('gitmate-workspace-tab', switchTab);
  }, []);

  const [diff, setDiff] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);

  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Fork-style actions: discard, stash, merge, branch deletion, worktrees. Each asks first when it changes or removes data.
  const [confirm, setConfirm] = useState<{ title: string; message: React.ReactNode; label: string; destructive?: boolean; run: () => void } | null>(null);
  const [stashOpen, setStashOpen] = useState(false);
  const [stashMessage, setStashMessage] = useState('');
  const [stashUntracked, setStashUntracked] = useState(true);
  const [newWorktreeOpen, setNewWorktreeOpen] = useState(false);
  const runAction = async (url: string, body: Record<string, unknown>): Promise<ActionResult['result'] | null> => {
    try {
      const res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: repoSummary.path, ...body }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDetails(data.updated); onDetailsUpdated(data.updated); onRefreshParent();
      if (data.result?.message) setSyncNotice({ type: data.result.ok === false && !data.result.needsConfirmation ? 'error' : 'success', message: data.result.message });
      return data.result;
    } catch (error: any) { setSyncNotice({ type: 'error', message: error.message || 'The action failed.' }); return null; }
  };
  const askDiscard = (files: string[] | 'all') => setConfirm({
    title: files === 'all' ? 'Discard all changes?' : `Discard changes to ${files[0].split('/').pop()}?`, label: 'Discard', destructive: true,
    message: <>Edited files return to the last commit. A backup is kept as a stash named “Git Mate discard backup”. New files that Git does not track yet are deleted permanently.</>,
    run: () => { void runAction('/api/repos/discard', { files }).then(result => { if (result) setSyncNotice({ type: 'success', message: `Discarded ${result.discarded} ${result.discarded === 1 ? 'file' : 'files'}.${result.backup ? ' A backup stash was saved.' : ''}` }); }); }
  });
  const askMerge = (branch: string) => setConfirm({
    title: `Merge ${branch}?`, label: 'Merge',
    message: <>Commits from <span className="font-mono">{branch}</span> are merged into <span className="font-mono">{details?.currentBranch || repoSummary.currentBranch}</span>. If files conflict, Git Mate stops so you can resolve them or abort.</>,
    run: () => { void runAction('/api/repos/merge', { branch }); }
  });
  const askDeleteBranch = (branch: string, force = false) => setConfirm({
    title: force ? `Delete ${branch} anyway?` : `Delete branch ${branch}?`, label: force ? 'Delete anyway' : 'Delete', destructive: true,
    message: force ? <>This branch has commits that are not merged anywhere. Deleting it can lose them.</> : <>The local branch is removed. Remote branches are not changed.</>,
    run: () => { void runAction('/api/repos/branch/delete', { branch, force }).then(result => { if (result?.needsConfirmation) askDeleteBranch(branch, true); }); }
  });

  useEffect(() => {
    if (!syncNotice) return;
    const timer = setTimeout(() => setSyncNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [syncNotice]);

  // Branch switcher dropdown & create
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [newBranchInput, setNewBranchInput] = useState('');
  const branchDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isBranchDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setIsBranchDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isBranchDropdownOpen]);

  // Working Tree panel resizable width
  const [workingTreeWidth, setWorkingTreeWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('gitmate_working_tree_width');
      if (!saved || !Number.isFinite(Number(saved))) return 290;
      return Math.max(220, Math.min(550, Number(saved)));
    } catch {
      return 290;
    }
  });
  const [isResizingWorkingTree, setIsResizingWorkingTree] = useState(false);

  const handleWorkingTreeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingWorkingTree(true);
    const startX = e.clientX;
    const startWidth = workingTreeWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.max(220, Math.min(550, startWidth + delta));
      setWorkingTreeWidth(nextWidth);
      try {
        localStorage.setItem('gitmate_working_tree_width', String(nextWidth));
      } catch {
        // Ignore storage errors
      }
    };

    const onMouseUp = () => {
      setIsResizingWorkingTree(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 1. Fetch details on repo change
  const fetchDetails = async (signal?: AbortSignal) => {
    try {
      const res = await apiFetch(`/api/repos/details?path=${encodeURIComponent(repoSummary.path)}`, { signal });
      if (res.ok) {
        const data: RepoDetails = await res.json();
        if (signal?.aborted) return;
        setDetails(data);
        onDetailsUpdated(data);

        // Auto select first file if none selected
        if (data.files.length > 0 && !selectedFile) {
          onSelectFile(data.files[0].path, data.files[0].isStaged);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchDetails(controller.signal);
    return () => controller.abort();
  }, [repoSummary]);

  const [imagePreview, setImagePreview] = useState<{ dataUrl?: string; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setImagePreview(null);
    if (!selectedFile || !/\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(selectedFile)) return () => controller.abort();
    apiFetch(`/api/repos/preview?path=${encodeURIComponent(repoSummary.path)}&file=${encodeURIComponent(selectedFile)}&staged=${selectedDiffStaged}`, { signal: controller.signal })
      .then(response => response.json()).then(data => { if (!controller.signal.aborted) setImagePreview(data); })
      .catch(() => { if (!controller.signal.aborted) setImagePreview({ error: 'Image preview could not be loaded.' }); });
    return () => controller.abort();
  }, [repoSummary.path, selectedFile, selectedDiffStaged]);

  // Cancel stale requests when the selection changes, including the initial all-files request.
  useEffect(() => {
    const controller = new AbortController();
    const fetchDiff = async () => {
      setLoadingDiff(true);
      try {
        const url = `/api/repos/diff?path=${encodeURIComponent(repoSummary.path)}${
          selectedFile ? `&file=${encodeURIComponent(selectedFile)}` : ''
        }&staged=${selectedDiffStaged}`;
        const res = await apiFetch(url, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (!controller.signal.aborted) setDiff(data.diff || '');
        }
      } catch {
        if (!controller.signal.aborted) setDiff('');
      } finally {
        if (!controller.signal.aborted) setLoadingDiff(false);
      }
    };
    fetchDiff();
    return () => controller.abort();
  }, [selectedFile, selectedDiffStaged, repoSummary.path]);

  // Stage single file
  const handleStage = async (file: string) => {
    try {
      const res = await apiFetch('/api/repos/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, files: [file] })
      });
      if (!res.ok) {
        const failure = await res.json();
        setSyncNotice({ type: 'error', message: failure.error || 'The Git operation failed.' });
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onSelectFile(file, true);
        onRefreshParent();
      }
    } catch (e) {
      setSyncNotice({ type: 'error', message: 'Could not update the working tree. Retry after refreshing the repository.' });
    }
  };

  // Unstage single file
  const handleUnstage = async (file: string) => {
    try {
      const res = await apiFetch('/api/repos/unstage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, files: [file] })
      });
      if (!res.ok) {
        const failure = await res.json();
        setSyncNotice({ type: 'error', message: failure.error || 'The Git operation failed.' });
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onSelectFile(file, false);
        onRefreshParent();
      }
    } catch (e) {
      setSyncNotice({ type: 'error', message: 'Could not update the working tree. Retry after refreshing the repository.' });
    }
  };

  // Stage All
  const handleStageAll = async () => {
    try {
      const res = await apiFetch('/api/repos/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, files: ['.'] })
      });
      if (!res.ok) {
        const failure = await res.json();
        setSyncNotice({ type: 'error', message: failure.error || 'The Git operation failed.' });
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        if (selectedFile) onSelectFile(selectedFile, true);
        onRefreshParent();
      }
    } catch (e) {
      setSyncNotice({ type: 'error', message: 'Could not update the working tree. Retry after refreshing the repository.' });
    }
  };

  // Unstage All
  const handleUnstageAll = async () => {
    try {
      const res = await apiFetch('/api/repos/unstage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, files: [] })
      });
      if (!res.ok) {
        const failure = await res.json();
        setSyncNotice({ type: 'error', message: failure.error || 'The Git operation failed.' });
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        if (selectedFile) onSelectFile(selectedFile, false);
        onRefreshParent();
      }
    } catch (e) {
      setSyncNotice({ type: 'error', message: 'Could not update the working tree. Retry after refreshing the repository.' });
    }
  };

  // Pull
  const handlePull = async () => {
    setIsPulling(true);
    setSyncNotice(null);
    try {
      const res = await apiFetch('/api/repos/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, remote: syncRemote, pushIndex: undefined })
      });
      const data = await res.json();
      if (res.ok) {
        setSyncNotice({
          type: 'success',
          message: data.output || 'Successfully pulled latest changes from remote.'
        });
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onRefreshParent();
      } else {
        setSyncNotice({
          type: 'error',
          message: data.error || 'Pull failed. Check remote and local changes.'
        });
      }
    } catch (err: any) {
      setSyncNotice({
        type: 'error',
        message: err.message || 'Network error while pulling from remote.'
      });
    } finally {
      setIsPulling(false);
    }
  };

  // Push
  const handlePush = async (retry = false) => {
    setIsPushing(true); setSyncNotice(null);
    try {
      const previous = pushState.report;
      const data = await pushState.push(retry ? previous?.commitHash : undefined, retry ? previous?.results.filter(result => result.status !== 'verified').map(result => result.destination) : undefined);
      setSyncNotice({ type: data.success ? 'success' : 'error', message: data.success ? `Verified ${data.commitHash.slice(0, 7)} at every selected destination.` : 'Some pushes failed or could not be verified. Review each destination below.' });
    } catch (error: any) { setSyncNotice({ type: 'error', message: error.message }); }
    finally { setIsPushing(false); }
  };

  // Fetch
  const handleFetch = async () => {
    setIsFetching(true);
    setSyncNotice(null);
    try {
      const res = await apiFetch('/api/repos/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, remote: syncRemote, pushIndex: undefined })
      });
      const data = await res.json();
      if (res.ok) {
        setSyncNotice({
          type: 'success',
          message: data.output || `Fetched ${syncRemote}.`
        });
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onRefreshParent();
      } else {
        setSyncNotice({
          type: 'error',
          message: data.error || 'Fetch failed.'
        });
      }
    } catch (err: any) {
      setSyncNotice({
        type: 'error',
        message: err.message || 'Fetch error.'
      });
    } finally {
      setIsFetching(false);
    }
  };

  // Switch branch
  const handleSwitchBranch = async (branchName: string, remote = false) => {
    setIsBranchDropdownOpen(false);
    const active = details?.currentBranch || repoSummary.currentBranch;
    if (branchName === active) return;

    try {
      const res = await apiFetch('/api/repos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, branch: branchName, createNew: false, remote })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onRefreshParent();
        setSyncNotice({ type: 'success', message: data.output || `Switched to branch "${branchName}"` });
      } else {
        setSyncNotice({ type: 'error', message: data.error || `Failed to switch to "${branchName}"` });
      }
    } catch (e: any) {
      console.error(e);
      setSyncNotice({ type: 'error', message: e?.message || `Failed to switch to "${branchName}"` });
    }
  };

  // Create branch
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const branchName = newBranchInput.trim();
    if (!branchName) return;
    setIsBranchDropdownOpen(false);
    try {
      const res = await apiFetch('/api/repos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, branch: branchName, createNew: true })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewBranchInput('');
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onRefreshParent();
        setSyncNotice({ type: 'success', message: `Created and switched to branch "${branchName}"` });
      } else {
        setSyncNotice({ type: 'error', message: data.error || `Failed to create branch "${branchName}"` });
      }
    } catch (e: any) {
      console.error(e);
      setSyncNotice({ type: 'error', message: e?.message || 'Failed to create branch' });
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  const stagedFiles = details?.files.filter(f => f.isStaged) || [];
  const unstagedFiles = details?.files.filter(f => f.isUnstaged) || [];
  const currentActiveBranch = details?.currentBranch || repoSummary.currentBranch;
  // A local branch checked out in another worktree opens that worktree; Git cannot check out one branch twice.
  const worktreeOwner = (branch: string) => (details?.worktreeList || []).find(entry => entry.branch === branch && entry.path !== repoSummary.path && entry.prunable === null);
  // Remote branches without a local copy yet; choosing one creates a tracking branch.
  const remoteOnlyBranches = (details?.branches?.remote || [])
    .map(name => name.replace(/^remotes\//, ''))
    .filter(name => !name.endsWith('/HEAD') && !name.includes(' -> ') && !(details?.branches?.local || []).includes(name.slice(name.indexOf('/') + 1)));
  const availableBranches = Array.from(
    new Set([
      ...(details?.branches?.local || []),
      ...(currentActiveBranch ? [currentActiveBranch] : [])
    ].filter((b): b is string => Boolean(b && typeof b === 'string' && b.trim())))
  );

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-[var(--bg-canvas)] overflow-hidden transition-colors">
      {/* Top Workspace Header */}
      <div className="relative z-30 min-h-12 py-2 px-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-[var(--bg-card)] border border-[var(--border-interactive)] flex items-center justify-center text-[var(--accent-violet)] shrink-0">
            <FolderGit2 className="w-3.5 h-3.5" />
          </div>

          {/* Repo Name: protected shrink-0 with max-w */}
          <h2
            className="font-semibold text-xs text-[var(--text-primary)] tracking-tight shrink-0 max-w-[130px] sm:max-w-[200px] md:max-w-xs truncate select-text"
            title={repoSummary.name}
          >
            {repoSummary.name}
          </h2>

          {/* Branch Switcher Pill */}
          <div ref={branchDropdownRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-[33px] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border border-[var(--border-interactive)] text-[11px] font-mono text-[var(--text-primary)] transition cursor-pointer select-none"
              aria-expanded={isBranchDropdownOpen}
              aria-label="Switch branch"
            >
              <GitBranch className="w-3 h-3 text-[var(--accent-violet)] shrink-0" />
              <span className="max-w-[90px] sm:max-w-[130px] truncate">{currentActiveBranch}</span>
              <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] shrink-0 transition-transform ${isBranchDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isBranchDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 z-50 w-72 bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl p-2.5 text-xs shadow-2xl animate-in fade-in duration-150">
                <div className="max-h-72 overflow-y-auto space-y-0.5 my-1">
                  <p className="px-2 py-1 text-[9px] uppercase font-bold tracking-widest text-[var(--text-muted)] font-mono">Local</p>
                  {availableBranches.map(b => {
                    const owner = b !== currentActiveBranch ? worktreeOwner(b) : undefined;
                    const current = b === currentActiveBranch;
                    return <div key={b} className={`group flex items-center gap-1 rounded-lg ${current ? 'bg-[var(--bg-card)]' : 'hover:bg-[var(--bg-card)]'}`}>
                      <button
                        type="button"
                        onClick={() => { if (owner) { setIsBranchDropdownOpen(false); onOpenRepository?.(owner.path); } else handleSwitchBranch(b); }}
                        title={owner ? `Open the worktree at ${owner.path}` : undefined}
                        className={`flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[11px] cursor-pointer select-none ${current ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'}`}
                      >
                        <span className="truncate">{b}</span>
                        {owner && <span className="shrink-0 px-1.5 rounded-full border border-[var(--border-interactive)] text-[9px] text-[var(--text-muted)] font-sans">worktree</span>}
                      </button>
                      {current ? <Check className="w-3.5 h-3.5 mr-2.5 text-[var(--accent-violet)] shrink-0" /> : <span className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                        <button type="button" onClick={() => { setIsBranchDropdownOpen(false); askMerge(b); }} aria-label={`Merge ${b} into ${currentActiveBranch}`} title={`Merge into ${currentActiveBranch}`} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-violet)]"><GitMerge className="w-3 h-3" /></button>
                        {!owner && <button type="button" onClick={() => { setIsBranchDropdownOpen(false); askDeleteBranch(b); }} aria-label={`Delete branch ${b}`} title="Delete branch" className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>}
                      </span>}
                    </div>;
                  })}
                  {remoteOnlyBranches.length > 0 && <p className="px-2 pt-2 pb-1 text-[9px] uppercase font-bold tracking-widest text-[var(--text-muted)] font-mono">Remote</p>}
                  {remoteOnlyBranches.map(b => (
                    <div key={b} className="group flex items-center gap-1 rounded-lg hover:bg-[var(--bg-card)]">
                      <button
                        type="button"
                        onClick={() => handleSwitchBranch(b, true)}
                        title={`Create a local branch that tracks ${b}`}
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-left font-mono text-[11px] cursor-pointer select-none text-[var(--text-secondary)]"
                      >
                        <span className="block truncate"><span className="text-[var(--text-muted)]">{b.slice(0, b.indexOf('/') + 1)}</span>{b.slice(b.indexOf('/') + 1)}</span>
                      </button>
                      <button type="button" onClick={() => { setIsBranchDropdownOpen(false); askMerge(b); }} aria-label={`Merge ${b} into ${currentActiveBranch}`} title={`Merge into ${currentActiveBranch}`} className="p-1 mr-1.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--text-muted)] hover:text-[var(--accent-violet)]"><GitMerge className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleCreateBranch} className="pt-2 border-t border-[var(--border-subtle)] flex gap-1.5">
                  <input
                    type="text"
                    value={newBranchInput}
                    onChange={e => setNewBranchInput(e.target.value)}
                    aria-label="New branch name"
                    placeholder="New branch name..."
                    className="flex-1 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-[33px] px-2.5 py-1 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
                  />
                  <button
                    type="submit"
                    aria-label="Create branch"
                    className="px-2.5 py-1 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[33px] font-semibold text-xs cursor-pointer select-none"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </form>
                <button type="button" onClick={() => { setIsBranchDropdownOpen(false); setNewWorktreeOpen(true); }} className="mt-2 w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]">
                  <GitFork className="w-3.5 h-3.5 text-[var(--accent-violet)]" /> New Worktree…
                </button>
              </div>
            )}
          </div>

          <span className="text-[11px] text-[var(--text-dim)] font-mono hidden 2xl:inline truncate max-w-xs" title={repoSummary.path}>
            {repoSummary.path}
          </span>
        </div>

        {/* Sync Controls (Pill Ghost Buttons with Responsive Labels) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleFetch}
            disabled={isFetching}
            title="Fetch remote branches"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-[33px] border border-[var(--border-interactive)] hover:border-[var(--text-muted)] bg-transparent text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-30 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline text-xs">Fetch</span>
          </button>

          <button
            onClick={handlePull}
            disabled={isPulling}
            title={repoSummary.behind > 0 ? `Pull ${repoSummary.behind} incoming commits` : 'Pull remote changes'}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-[33px] border border-[var(--border-interactive)] hover:border-[var(--text-muted)] bg-transparent text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-30 cursor-pointer"
          >
            <ArrowDownRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <span className="hidden sm:inline text-xs">Pull</span>
            {repoSummary.behind > 0 && (
              <span className="font-mono text-[10px] font-bold text-sky-400">
                ({repoSummary.behind})
              </span>
            )}
          </button>

          <button
            onClick={() => handlePush()}
            disabled={isPushing || !pushState.destinations.length || pushState.pushing || !repoSummary.lastCommit}
            title={repoSummary.ahead > 0 ? `Push ${repoSummary.ahead} local commits` : 'Push to remote'}
            className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-[33px] border border-[var(--border-interactive)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] transition disabled:opacity-30 cursor-pointer"
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--accent-violet)] shrink-0" />
            <span className="hidden sm:inline text-xs">Push</span>
            {repoSummary.ahead > 0 && (
              <span className="font-mono text-[10px] font-bold text-[var(--accent-violet)]">
                ({repoSummary.ahead})
              </span>
            )}
          </button>

          {onOpenRemoteAuth && (
            <button
              onClick={onOpenRemoteAuth}
              title="Remote & Authentication Settings"
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-[33px] border border-[var(--border-interactive)] hover:border-[var(--text-muted)] bg-transparent text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              <span className="hidden md:inline text-[11px]">Remote</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync Status Banner */}
      {/* Mode Underline Tabs */}
      <div className="h-10 px-5 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div className="h-full flex gap-6">
          <button
            onClick={() => setActiveTab('changes')}
            className={`h-full text-xs font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'changes'
                ? 'border-[var(--accent-violet)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <FileEdit className="w-3.5 h-3.5" />
            <span>Changes</span>
            {(details?.files.length ?? 0) > 0 && (
              <span className="px-2 py-0.2 rounded-[50px] border border-[var(--border-interactive)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-mono text-[10px]">
                {details?.files.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`h-full text-xs font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'history'
                ? 'border-[var(--accent-violet)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
          </button>

          <button
            onClick={() => setActiveTab('branches')}
            className={`h-full text-xs font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'branches'
                ? 'border-[var(--accent-violet)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Remotes</span>
          </button>

          <button
            onClick={() => setActiveTab('graph')}
            className={`h-full text-xs font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'graph'
                ? 'border-[var(--accent-violet)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>Graph</span>
          </button>
        </div>
      </div>

      {details?.pending && (
        <div role="status" className="px-5 py-2.5 text-xs flex items-center justify-between gap-3 border-b bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:border-amber-500/30 dark:text-amber-200 shrink-0">
          <span className="flex items-center gap-2 min-w-0"><AlertTriangle className="w-4 h-4 shrink-0" /><span className="text-pretty">A {details.pending} stopped on conflicts. Resolve the conflicted files, stage them, and commit — or abort to go back.</span></span>
          <button type="button" onClick={() => setConfirm({ title: `Abort the ${details.pending}?`, label: 'Abort', destructive: true, message: <>The repository returns to how it was before the {details.pending}. Conflict resolutions you made are lost.</>, run: () => { void runAction('/api/repos/abort', {}); } })}
            className="shrink-0 px-3 py-1 rounded-full border border-current/30 hover:bg-black/5 dark:hover:bg-white/10 font-medium">Abort</button>
        </div>
      )}

      {syncNotice && (
        <div className={`px-5 py-2.5 text-xs flex items-center justify-between border-b transition-all shrink-0 ${
          syncNotice.type === 'success'
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-300'
            : 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-200'
        }`}>
          <div className="flex items-start gap-2.5 min-w-0 flex-1 mr-3">
            {syncNotice.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[11px] font-medium break-words leading-relaxed select-text">{syncNotice.message}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {syncNotice.type === 'error' && onOpenRemoteAuth && (
              <button
                onClick={onOpenRemoteAuth}
                className="px-3 py-1 rounded-[33px] bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 dark:text-rose-200 dark:border-rose-500/30 font-sans text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-rose-700 dark:text-rose-300" />
                <span>Configure Remote / Auth</span>
              </button>
            )}
            <button aria-label="Dismiss notice" onClick={() => setSyncNotice(null)} className="p-1 text-[var(--text-primary)] hover:opacity-70 transition cursor-pointer">✕</button>
          </div>
        </div>
      )}

      {pushState.report && <div className="px-5 py-2"><PushResults report={pushState.report} busy={pushState.pushing} retry={() => handlePush(true)} /></div>}


      {/* Main Workspace Body */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex flex-wrap gap-2 items-center text-xs">
        <div className="flex items-center gap-2 min-w-0" title={`${repoSummary.remotes.find(remote => remote.name === syncRemote)?.fetchUrl || 'No remote'}\nTracking: ${details?.tracking || 'not configured'}`}><span>Fetch / pull from</span><Dropdown label="Fetch and pull remote" value={syncRemote} options={repoSummary.remotes.map(remote => ({ value: remote.name, label: remote.name }))} onChange={value => onSyncTargetChange(value, 0)} /></div>
        <div className="flex items-center gap-2 min-w-0"><span>Push to</span><Dropdown label="Push destinations" multiple value={pushState.destinations.map(destinationKey)} options={pushState.all.map(target => ({ value: destinationKey(target), label: target.url, group: target.remote }))} onChange={pushState.toggle} placeholder="Choose destinations" /></div>
        {pushState.stale && <p className="text-amber-600">A saved destination changed. Select the destinations again.</p>}
      </div>

      {activeTab === 'changes' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Sub-panel 1: Files List */}
          <div
            style={{ width: workingTreeWidth }}
            className="border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-canvas)] select-none shrink-0"
          >
            <div className="p-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)] gap-2">
              <span className="font-semibold text-[var(--text-primary)] text-[11px] uppercase tracking-wider whitespace-nowrap shrink-0">
                Working Tree
              </span>
              {/* Compact icon actions keep the header on one line in a narrow column. */}
              <div className="flex items-center gap-0.5 whitespace-nowrap shrink-0">
                <button type="button" onClick={handleStageAll} title="Stage all" aria-label="Stage all" className="p-1.5 rounded-md hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition cursor-pointer"><CheckSquare className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={handleUnstageAll} title="Unstage all" aria-label="Unstage all" className="p-1.5 rounded-md hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition cursor-pointer"><Square className="w-3.5 h-3.5" /></button>
                <button type="button" disabled={!(details?.files.length)} onClick={() => askDiscard('all')} title="Discard all changes" aria-label="Discard all changes" className="p-1.5 rounded-md hover:bg-[var(--bg-surface)] hover:text-rose-500 transition cursor-pointer disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5" /></button>
                <div className="relative">
                  <button type="button" onClick={() => setStashOpen(!stashOpen)} aria-expanded={stashOpen} title="Stash" aria-label="Stash" className="flex items-center gap-1 p-1.5 rounded-md hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition cursor-pointer">
                    <Archive className="w-3.5 h-3.5" />{details?.stashes?.length ? <span className="text-[10px] font-mono">{details.stashes.length}</span> : null}
                  </button>
                  {stashOpen && <>
                    <div className="fixed inset-0 z-40" onClick={() => setStashOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl p-3 shadow-2xl font-sans space-y-3 whitespace-normal">
                      <form onSubmit={event => { event.preventDefault(); void runAction('/api/repos/stash', { message: stashMessage.trim() || undefined, includeUntracked: stashUntracked }).then(result => { if (result) { setStashMessage(''); } }); }} className="space-y-2">
                        <p className="text-[11px] font-semibold text-[var(--text-primary)]">Stash changes</p>
                        <input value={stashMessage} onChange={event => setStashMessage(event.target.value)} placeholder="Description (optional)" className="w-full bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-full px-3 py-1.5 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]" />
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]"><input type="checkbox" checked={stashUntracked} onChange={event => setStashUntracked(event.target.checked)} className="accent-[var(--accent-violet)]" />Include new files</label>
                          <button type="submit" disabled={!(details?.files.length)} className="px-3 py-1 rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-[11px] font-medium disabled:opacity-40">Stash</button>
                        </div>
                      </form>
                      <div className="border-t border-[var(--border-subtle)] pt-2">
                        <p className="text-[9px] uppercase font-bold tracking-widest text-[var(--text-muted)] font-mono mb-1">Saved stashes</p>
                        {!details?.stashes?.length && <p className="text-[11px] text-[var(--text-muted)] py-1">No stashes.</p>}
                        <ul className="max-h-56 overflow-y-auto space-y-0.5">
                          {details?.stashes?.map(stash => <li key={stash.ref} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-card)]">
                            <span className="flex-1 min-w-0"><span className="block truncate text-[11px] text-[var(--text-primary)]" title={stash.subject}>{stash.subject}</span><span className="block text-[10px] text-[var(--text-muted)]">{new Date(stash.date * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
                            <button type="button" onClick={() => runAction('/api/repos/stash/action', { action: 'pop', ref: stash.ref })} title="Apply and remove" className="text-[10px] text-[var(--accent-violet)] hover:underline">Pop</button>
                            <button type="button" onClick={() => runAction('/api/repos/stash/action', { action: 'apply', ref: stash.ref })} title="Apply and keep" className="text-[10px] text-[var(--text-secondary)] hover:underline">Apply</button>
                            <button type="button" aria-label={`Delete stash ${stash.subject}`} onClick={() => setConfirm({ title: 'Delete this stash?', label: 'Delete', destructive: true, message: <>“{stash.subject}” is deleted. Its changes cannot be restored afterwards.</>, run: () => { void runAction('/api/repos/stash/action', { action: 'drop', ref: stash.ref }); } })} className="text-[var(--text-muted)] hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
                          </li>)}
                        </ul>
                      </div>
                    </div>
                  </>}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {/* Staged Changes */}
              {stagedFiles.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center justify-between">
                    <span>Staged ({stagedFiles.length})</span>
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {stagedFiles.map(file => {
                      const isSelected = selectedFile === file.path && selectedDiffStaged;
                      return (
                        <div
                          key={'staged-' + file.path}
                          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition border gap-2 ${
                            isSelected
                              ? 'bg-[var(--bg-card)] border-[var(--border-interactive)] text-[var(--text-primary)]'
                              : 'border-transparent hover:bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                handleUnstage(file.path);
                              }}
                              className="text-[var(--accent-violet)] hover:text-[var(--text-primary)] p-0.5 shrink-0"
                              aria-label={`Unstage ${file.path}`}
                              title="Unstage file"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectFile(file.path, true)}
                              aria-label={`Preview ${file.path} (staged)`}
                              title={file.path}
                              className="truncate flex-1 text-left"
                            >
                              {file.path}
                            </button>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--text-primary)] shrink-0">{file.indexStatus}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unstaged Changes */}
              <div>
                <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center justify-between">
                  <span>Changes ({unstagedFiles.length})</span>
                </div>
                {unstagedFiles.length === 0 && stagedFiles.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[var(--text-muted)] font-mono">
                    Working tree is clean
                  </div>
                ) : (
                  <div className="space-y-0.5 mt-0.5">
                    {unstagedFiles.map(file => {
                      const isSelected = selectedFile === file.path && !selectedDiffStaged;
                      return (
                        <div
                          key={'unstaged-' + file.path}
                          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition border gap-2 ${
                            isSelected
                              ? 'bg-[var(--bg-card)] border-[var(--border-interactive)] text-[var(--text-primary)]'
                              : 'border-transparent hover:bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                handleStage(file.path);
                              }}
                              className="text-[var(--text-dim)] hover:text-[var(--accent-violet)] p-0.5 shrink-0"
                              aria-label={`Stage ${file.path}`}
                              title="Stage file"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectFile(file.path, false)}
                              aria-label={`Preview ${file.path} (working tree)`}
                              title={file.path}
                              className="truncate flex-1 text-left"
                            >
                              {file.path}
                            </button>
                          </div>
                          <button type="button" onClick={event => { event.stopPropagation(); askDiscard([file.path]); }} aria-label={`Discard changes to ${file.path}`} title="Discard changes"
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--text-muted)] hover:text-rose-500 p-0.5 shrink-0"><RotateCcw className="w-3 h-3" /></button>
                          <span className="text-[10px] font-bold text-[var(--text-muted)] shrink-0">
                            {file.workingDirStatus === '?' ? 'U' : file.workingDirStatus}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Working Tree Resizer Handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            tabIndex={0}
            onKeyDown={event => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                const width = Math.max(220, Math.min(550, workingTreeWidth + (event.key === 'ArrowRight' ? 20 : -20)));
                setWorkingTreeWidth(width);
                try {
                  localStorage.setItem('gitmate_working_tree_width', String(width));
                } catch {
                  // ignore
                }
              }
            }}
            onMouseDown={handleWorkingTreeMouseDown}
            onDoubleClick={() => {
              setWorkingTreeWidth(290);
              try {
                localStorage.setItem('gitmate_working_tree_width', '290');
              } catch {
                // ignore
              }
            }}
            title="Drag to resize Working Tree panel (Double-click to reset)"
            className={`w-[6px] -ml-[3px] -mr-[3px] z-10 cursor-col-resize group relative flex items-center justify-center shrink-0 select-none ${
              isResizingWorkingTree ? 'bg-[var(--accent-violet)]/30' : 'hover:bg-[var(--accent-violet)]/20'
            } transition-colors`}
          >
            <div
              className={`w-[1px] h-full transition-colors ${
                isResizingWorkingTree ? 'bg-[var(--accent-violet)]' : 'bg-transparent group-hover:bg-[var(--accent-violet)]'
              }`}
            />
          </div>

          {/* Sub-panel 2: Diff Viewer */}
          <div className="flex-1 min-w-0 h-full p-2.5 overflow-hidden bg-[var(--bg-canvas)] flex flex-col">
            <DiffViewer
              diff={diff}
              preview={imagePreview}
              filename={selectedFile || 'All Files'}
              staged={selectedDiffStaged}
            />
          </div>
        </div>
      )}

      {/* Tab: History */}
      {activeTab === 'history' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-2 bg-[var(--bg-canvas)]">
          {details?.recentCommits.map(c => (
            <div
              key={c.hash}
              className="p-3.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-interactive)] rounded-2xl transition flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <button
                    onClick={() => copyHash(c.hash)}
                    className="flex items-center gap-1 font-mono text-[11px] px-2.5 py-0.5 rounded-[50px] bg-[var(--bg-card)] border border-[var(--border-interactive)] text-[var(--accent-violet)] hover:text-[var(--text-primary)] transition"
                    title="Copy commit hash"
                  >
                    <span>{c.hash}</span>
                    {copiedHash === c.hash ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-[var(--text-muted)]" />}
                  </button>
                  <span className="text-xs text-[var(--text-primary)] font-medium">{c.author_name}</span>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">• {new Date(c.date).toLocaleString()}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] font-mono whitespace-pre-line pl-1 leading-relaxed">{c.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'graph' && <GitGraph repoPath={repoSummary.path} currentBranch={currentActiveBranch} onChanged={() => { void fetchDetails(); onRefreshParent(); }} onNotice={(type, message) => setSyncNotice({ type, message })} />}

      {/* Tab: Remotes */}
      {activeTab === 'branches' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[var(--bg-canvas)]">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Worktrees</h3>
              <div className="flex items-center gap-1.5">
                {(details?.worktreeList || []).some(entry => entry.prunable !== null && entry.locked === null) && <button type="button" onClick={() => runAction('/api/repos/worktrees/prune', {})} className="px-3 py-1 rounded-full border border-[var(--border-interactive)] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]">Clean up missing</button>}
                <button type="button" onClick={() => setNewWorktreeOpen(true)} className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--border-interactive)] text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"><Plus className="w-3 h-3" />New Worktree</button>
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mb-3 text-pretty">Extra folders that share this repository, each with its own branch. AI coding agents often create them; open one to review its changes.</p>
            <div className="space-y-2">
              {(details?.worktreeList || []).map(entry => {
                const here = entry.path === repoSummary.path;
                return <div key={entry.path} className="p-3.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl text-xs flex items-center gap-3">
                  <GitFork className="w-4 h-4 shrink-0 text-[var(--accent-violet)]" />
                  <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-1.5 flex-wrap font-mono text-[var(--text-primary)]">
                      <span className="truncate">{entry.branch || `detached · ${(entry.head || '').slice(0, 7)}`}</span>
                      {entry.main && <span className="px-1.5 rounded-full border border-[var(--border-interactive)] text-[9px] text-[var(--text-muted)] font-sans">main</span>}
                      {here && <span className="px-1.5 rounded-full bg-[var(--accent-violet)]/15 text-[9px] text-[var(--accent-violet)] font-sans">open</span>}
                      {entry.locked !== null && <span className="px-1.5 rounded-full border border-[var(--border-interactive)] text-[9px] text-[var(--text-muted)] font-sans" title={entry.locked || undefined}>locked</span>}
                      {entry.prunable !== null && <span className="px-1.5 rounded-full border border-amber-500/40 text-[9px] text-amber-500 font-sans">missing</span>}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] truncate font-mono mt-0.5" title={entry.path}>{entry.path}</p>
                  </div>
                  {!here && entry.prunable === null && <button type="button" onClick={() => onOpenRepository?.(entry.path)} className="shrink-0 px-3 py-1 rounded-full border border-[var(--border-interactive)] text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-card)]">Open</button>}
                </div>;
              })}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Configured Remotes
            </h3>
            <div className="space-y-2">
              {details?.remotes.map(r => (
                <div key={r.name} className="p-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl font-mono text-xs">
                  <div className="font-bold text-[var(--text-primary)] mb-1.5 flex items-center gap-2">
                    <span className="text-[var(--accent-violet)]">{r.name}</span>
                  </div>
                  <div className="text-[var(--text-muted)] text-[11px] truncate mb-0.5">Fetch: {r.fetchUrl}</div>
                  <div className="text-[var(--text-muted)] text-[11px] truncate">Push:  {r.pushUrl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirm} title={confirm?.title || ''} message={confirm?.message} confirmLabel={confirm?.label || 'OK'} destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)} onConfirm={() => { const pending = confirm; setConfirm(null); pending?.run(); }} />
      <NewWorktreeDialog open={newWorktreeOpen} repoPath={repoSummary.path} repoName={(details?.worktreeList?.[0]?.path || repoSummary.path).split('/').pop() || repoSummary.name}
        mainPath={details?.worktreeList?.[0]?.path || repoSummary.path} currentBranch={currentActiveBranch} localBranches={details?.branches?.local || []} worktrees={details?.worktreeList || []}
        onClose={() => setNewWorktreeOpen(false)} onCreated={created => { setNewWorktreeOpen(false); onOpenRepository?.(created); }} />
    </div>
  );
};
