import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  GitPullRequest,
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
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { RepoDetails, RepoSummary, FileChange } from '../types';
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
  const [loading, setLoading] = useState(true);
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
      setLoading(true);
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
    } finally {
      setLoading(false);
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
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        onDetailsUpdated(data.updated);
        onRefreshParent();
      }
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
    <div className="flex-1 h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Top Workspace Header */}
      <div className="h-14 px-5 border-b border-slate-800/80 bg-slate-950 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400 shrink-0">
            <FolderGit2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-white truncate">{repoSummary.name}</h2>
              
              {/* Branch Selector Pill */}
              <div className="relative">
                <button
                  onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-mono text-indigo-300 transition"
                >
                  <GitBranch className="w-3 h-3 text-indigo-400" />
                  <span className="max-w-[120px] truncate">{details?.currentBranch || repoSummary.currentBranch}</span>
                  <ChevronDown className="w-3 h-3 text-slate-500" />
                </button>

                {isBranchDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 text-xs">
                    <div className="px-2 py-1 text-[10px] uppercase font-bold text-slate-500">
                      Branches ({details?.branches.local.length || 0})
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-0.5 my-1">
                      {details?.branches.local.map(b => (
                        <button
                          key={b}
                          onClick={() => handleSwitchBranch(b)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left font-mono text-xs transition ${
                            b === details.currentBranch
                              ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                              : 'hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <span className="truncate">{b}</span>
                          {b === details.currentBranch && <Check className="w-3 h-3 text-indigo-400" />}
                        </button>
                      ))}
                    </div>

                    <form onSubmit={handleCreateBranch} className="pt-2 border-t border-slate-800 flex gap-1">
                      <input
                        type="text"
                        value={newBranchInput}
                        onChange={e => setNewBranchInput(e.target.value)}
                        placeholder="New branch name..."
                        className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium text-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 font-mono truncate" title={repoSummary.path}>
              {repoSummary.path}
            </p>
          </div>
        </div>

        {/* Sync Controls (Fetch, Pull, Push) */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFetch}
            disabled={isFetching}
            title="Fetch remote changes"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs text-slate-300 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Fetch</span>
          </button>

          <button
            onClick={handlePull}
            disabled={isPulling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-medium text-slate-200 hover:text-white transition disabled:opacity-50"
          >
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
            <span>Pull {repoSummary.behind > 0 ? `(${repoSummary.behind})` : ''}</span>
          </button>

          <button
            onClick={handlePush}
            disabled={isPushing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition disabled:opacity-50"
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
            <span>Push {repoSummary.ahead > 0 ? `(${repoSummary.ahead})` : ''}</span>
          </button>
        </div>
      </div>

      {/* Mode Tabs (Changes / History / Branches) */}
      <div className="px-5 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between shrink-0">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('changes')}
            className={`py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'changes'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileEdit className="w-3.5 h-3.5" />
            <span>Working Tree Changes</span>
            {(details?.files.length ?? 0) > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/15 text-indigo-300 font-mono text-[10px]">
                {details?.files.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'history'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Commit History</span>
          </button>

          <button
            onClick={() => setActiveTab('branches')}
            className={`py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'branches'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Remotes & Branches</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      {activeTab === 'changes' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Sub-panel 1: File List */}
          <div className="w-72 border-r border-slate-800/80 flex flex-col bg-slate-950/70 select-none shrink-0">
            <div className="p-2.5 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Files</span>
              <div className="flex gap-2 text-[11px]">
                <button onClick={handleStageAll} className="text-slate-400 hover:text-emerald-400 transition">
                  Stage All
                </button>
                <span className="text-slate-600">|</span>
                <button onClick={handleUnstageAll} className="text-slate-400 hover:text-rose-400 transition">
                  Unstage
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {/* Staged Changes */}
              {stagedFiles.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
                    <span>Staged ({stagedFiles.length})</span>
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {stagedFiles.map(file => {
                      const isSelected = selectedFile === file.path && selectedDiffStaged;
                      return (
                        <div
                          key={'staged-' + file.path}
                          onClick={() => onSelectFile(file.path, true)}
                          className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition ${
                            isSelected
                              ? 'bg-indigo-600/20 text-white border border-indigo-500/40'
                              : 'hover:bg-slate-900 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              onClick={e => {
                                e.stopPropagation();
                                handleUnstage(file.path);
                              }}
                              className="text-emerald-400 hover:text-emerald-300 p-0.5"
                              title="Unstage file"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                            </span>
                            <span className="truncate">{file.path}</span>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-400">M</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unstaged Changes */}
              <div>
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center justify-between">
                  <span>Changes ({unstagedFiles.length})</span>
                </div>
                {unstagedFiles.length === 0 && stagedFiles.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    Working directory is clean
                  </div>
                ) : (
                  <div className="space-y-0.5 mt-0.5">
                    {unstagedFiles.map(file => {
                      const isSelected = selectedFile === file.path && !selectedDiffStaged;
                      return (
                        <div
                          key={'unstaged-' + file.path}
                          onClick={() => onSelectFile(file.path, false)}
                          className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition ${
                            isSelected
                              ? 'bg-indigo-600/20 text-white border border-indigo-500/40'
                              : 'hover:bg-slate-900 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              onClick={e => {
                                e.stopPropagation();
                                handleStage(file.path);
                              }}
                              className="text-slate-600 hover:text-emerald-400 p-0.5"
                              title="Stage file"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </span>
                            <span className="truncate">{file.path}</span>
                          </div>
                          <span className="text-[10px] font-bold text-amber-400">
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
          <div className="flex-1 h-full p-3 overflow-hidden bg-slate-950/40 flex flex-col">
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
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {details?.recentCommits.map(c => (
            <div
              key={c.hash}
              className="p-3 bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 rounded-xl transition flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => copyHash(c.hash)}
                    className="flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-400 hover:bg-slate-800 transition"
                    title="Copy commit hash"
                  >
                    <span>{c.hash}</span>
                    {copiedHash === c.hash ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500" />}
                  </button>
                  <span className="text-xs text-slate-300 font-medium">{c.author_name}</span>
                  <span className="text-[11px] text-slate-500">• {new Date(c.date).toLocaleString()}</span>
                </div>
                <p className="text-xs text-slate-200 font-mono whitespace-pre-line pl-1">{c.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Remotes */}
      {activeTab === 'branches' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Configured Remotes
            </h3>
            <div className="space-y-2">
              {details?.remotes.map(r => (
                <div key={r.name} className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl font-mono text-xs">
                  <div className="font-bold text-indigo-400 mb-1">{r.name}</div>
                  <div className="text-slate-400 text-[11px] truncate">Fetch: {r.fetchUrl}</div>
                  <div className="text-slate-400 text-[11px] truncate">Push:  {r.pushUrl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
