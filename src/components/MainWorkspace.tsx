import React, { useState, useEffect } from 'react';
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
  ChevronDown
} from 'lucide-react';
import { RepoDetails, RepoSummary } from '../types';
import { DiffViewer } from './DiffViewer';

interface MainWorkspaceProps {
  repoSummary: RepoSummary;
  onRefreshParent: () => void;
  selectedFile: string | null;
  onSelectFile: (file: string, isStaged: boolean) => void;
  selectedDiffStaged: boolean;
  onDetailsUpdated: (details: RepoDetails) => void;
}

export const MainWorkspace: React.FC<MainWorkspaceProps> = ({
  repoSummary,
  onRefreshParent,
  selectedFile,
  onSelectFile,
  selectedDiffStaged,
  onDetailsUpdated
}) => {
  const [details, setDetails] = useState<RepoDetails | null>(null);
  const [activeTab, setActiveTab] = useState<'changes' | 'history' | 'branches'>('changes');
  
  const [diff, setDiff] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);

  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Branch switcher dropdown & create
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [newBranchInput, setNewBranchInput] = useState('');

  // 1. Fetch details on repo change
  const fetchDetails = async () => {
    try {
      const res = await fetch(`/api/repos/details?path=${encodeURIComponent(repoSummary.path)}`);
      if (res.ok) {
        const data: RepoDetails = await res.json();
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
    fetchDetails();
  }, [repoSummary.path]);

  // 2. Fetch diff when selected file changes
  useEffect(() => {
    const fetchDiff = async () => {
      setLoadingDiff(true);
      try {
        const url = `/api/repos/diff?path=${encodeURIComponent(repoSummary.path)}${
          selectedFile ? `&file=${encodeURIComponent(selectedFile)}` : ''
        }&staged=${selectedDiffStaged}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setDiff(data.diff || '');
        }
      } catch (err) {
        setDiff('');
      } finally {
        setLoadingDiff(false);
      }
    };

    fetchDiff();
  }, [selectedFile, selectedDiffStaged, repoSummary.path]);

  // Stage single file
  const handleStage = async (file: string) => {
    try {
      const res = await fetch('/api/repos/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, files: [file] })
      });
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onSelectFile(file, true);
        onRefreshParent();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Unstage single file
  const handleUnstage = async (file: string) => {
    try {
      const res = await fetch('/api/repos/unstage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, files: [file] })
      });
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onSelectFile(file, false);
        onRefreshParent();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Stage All
  const handleStageAll = async () => {
    try {
      const res = await fetch('/api/repos/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, files: ['.'] })
      });
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        if (selectedFile) onSelectFile(selectedFile, true);
        onRefreshParent();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Unstage All
  const handleUnstageAll = async () => {
    try {
      const res = await fetch('/api/repos/unstage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, files: [] })
      });
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        if (selectedFile) onSelectFile(selectedFile, false);
        onRefreshParent();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Pull
  const handlePull = async () => {
    setIsPulling(true);
    try {
      const res = await fetch('/api/repos/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path })
      });
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onRefreshParent();
      }
    } finally {
      setIsPulling(false);
    }
  };

  // Push
  const handlePush = async () => {
    setIsPushing(true);
    try {
      const res = await fetch('/api/repos/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path })
      });
      const data = await res.json();
      if (res.ok) {
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onRefreshParent();
      } else {
        alert(`Push failed: ${data.error || 'Check remote and credentials'}`);
      }
    } catch (err: any) {
      alert(`Push error: ${err.message}`);
    } finally {
      setIsPushing(false);
    }
  };

  // Fetch
  const handleFetch = async () => {
    setIsFetching(true);
    try {
      const res = await fetch('/api/repos/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path })
      });
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onRefreshParent();
      }
    } finally {
      setIsFetching(false);
    }
  };

  // Switch branch
  const handleSwitchBranch = async (branchName: string) => {
    setIsBranchDropdownOpen(false);
    try {
      const res = await fetch('/api/repos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, branch: branchName, createNew: false })
      });
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onRefreshParent();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Create branch
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchInput.trim()) return;
    setIsBranchDropdownOpen(false);
    try {
      const res = await fetch('/api/repos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, branch: newBranchInput.trim(), createNew: true })
      });
      if (res.ok) {
        const data = await res.json();
        setNewBranchInput('');
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onRefreshParent();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  const stagedFiles = details?.files.filter(f => f.isStaged) || [];
  const unstagedFiles = details?.files.filter(f => !f.isStaged) || [];

  return (
    <div className="flex-1 h-full flex flex-col bg-[var(--bg-canvas)] overflow-hidden transition-colors">
      {/* Top Workspace Header */}
      <div className="h-12 px-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[var(--bg-card)] border border-[var(--border-interactive)] flex items-center justify-center text-[var(--accent-violet)] shrink-0">
            <FolderGit2 className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex items-center gap-2.5">
            <h2 className="font-semibold text-xs text-[var(--text-primary)] tracking-tight truncate">{repoSummary.name}</h2>
            
            {/* Branch Switcher Pill */}
            <div className="relative">
              <button
                onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-[33px] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border border-[var(--border-interactive)] text-[11px] font-mono text-[var(--text-primary)] transition"
              >
                <GitBranch className="w-3 h-3 text-[var(--accent-violet)]" />
                <span className="max-w-[130px] truncate">{details?.currentBranch || repoSummary.currentBranch}</span>
                <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
              </button>

              {isBranchDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl p-2 text-xs shadow-none">
                  <div className="px-2 py-1 text-[9px] uppercase font-bold tracking-widest text-[var(--text-muted)]">
                    Branches ({details?.branches.local.length || 0})
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-0.5 my-1">
                    {details?.branches.local.map(b => (
                      <button
                        key={b}
                        onClick={() => handleSwitchBranch(b)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left font-mono text-[11px] transition ${
                          b === details.currentBranch
                            ? 'bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold'
                            : 'hover:bg-[var(--bg-card)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <span className="truncate">{b}</span>
                        {b === details.currentBranch && <Check className="w-3 h-3 text-[var(--accent-violet)]" />}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleCreateBranch} className="pt-2 border-t border-[var(--border-subtle)] flex gap-1">
                    <input
                      type="text"
                      value={newBranchInput}
                      onChange={e => setNewBranchInput(e.target.value)}
                      placeholder="New branch name..."
                      className="flex-1 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-[33px] px-2.5 py-1 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[33px] font-semibold text-xs"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </form>
                </div>
              )}
            </div>

            <span className="text-[11px] text-[var(--text-dim)] font-mono hidden md:inline truncate max-w-xs" title={repoSummary.path}>
              {repoSummary.path}
            </span>
          </div>
        </div>

        {/* Sync Controls (Pill Ghost Buttons) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleFetch}
            disabled={isFetching}
            title="Fetch remote branches"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[33px] border border-[var(--border-interactive)] hover:border-[var(--text-muted)] bg-transparent text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-30"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Fetch</span>
          </button>

          <button
            onClick={handlePull}
            disabled={isPulling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[33px] border border-[var(--border-interactive)] hover:border-[var(--text-muted)] bg-transparent text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-30"
          >
            <ArrowDownRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Pull {repoSummary.behind > 0 ? `(${repoSummary.behind})` : ''}</span>
          </button>

          <button
            onClick={handlePush}
            disabled={isPushing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[33px] border border-[var(--border-interactive)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] transition disabled:opacity-30"
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
            <span>Push {repoSummary.ahead > 0 ? `(${repoSummary.ahead})` : ''}</span>
          </button>
        </div>
      </div>

      {/* Mode Underline Tabs */}
      <div className="px-5 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('changes')}
            className={`py-2.5 text-xs font-medium flex items-center gap-2 border-b-2 transition ${
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
            className={`py-2.5 text-xs font-medium flex items-center gap-2 border-b-2 transition ${
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
            className={`py-2.5 text-xs font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'branches'
                ? 'border-[var(--accent-violet)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Remotes</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      {activeTab === 'changes' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Sub-panel 1: Files List */}
          <div className="w-72 border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-canvas)] select-none shrink-0">
            <div className="p-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-primary)] text-[11px] uppercase tracking-wider">Working Tree</span>
              <div className="flex gap-2 text-[11px] font-mono">
                <button onClick={handleStageAll} className="hover:text-[var(--text-primary)] transition">
                  Stage All
                </button>
                <span className="text-[var(--border-interactive)]">|</span>
                <button onClick={handleUnstageAll} className="hover:text-[var(--text-primary)] transition">
                  Unstage
                </button>
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
                          onClick={() => onSelectFile(file.path, true)}
                          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition border ${
                            isSelected
                              ? 'bg-[var(--bg-card)] border-[var(--border-interactive)] text-[var(--text-primary)]'
                              : 'border-transparent hover:bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              onClick={e => {
                                e.stopPropagation();
                                handleUnstage(file.path);
                              }}
                              className="text-[var(--accent-violet)] hover:text-[var(--text-primary)] p-0.5"
                              title="Unstage file"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                            </span>
                            <span className="truncate">{file.path}</span>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--text-primary)]">M</span>
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
                          onClick={() => onSelectFile(file.path, false)}
                          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition border ${
                            isSelected
                              ? 'bg-[var(--bg-card)] border-[var(--border-interactive)] text-[var(--text-primary)]'
                              : 'border-transparent hover:bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              onClick={e => {
                                e.stopPropagation();
                                handleStage(file.path);
                              }}
                              className="text-[var(--text-dim)] hover:text-[var(--accent-violet)] p-0.5"
                              title="Stage file"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </span>
                            <span className="truncate">{file.path}</span>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--text-muted)]">
                            {file.workingDirStatus === 'created' ? 'U' : 'M'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sub-panel 2: Diff Viewer */}
          <div className="flex-1 h-full p-2.5 overflow-hidden bg-[var(--bg-canvas)] flex flex-col">
            <DiffViewer
              diff={diff}
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

      {/* Tab: Remotes */}
      {activeTab === 'branches' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[var(--bg-canvas)]">
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
    </div>
  );
};
