import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  GitCommit,
  GitPullRequest,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Plus,
  Check,
  CheckSquare,
  Square,
  Sparkles,
  Send,
  History,
  FolderGit2,
  FileCode,
  FilePlus,
  FileX,
  FileEdit,
  Cpu,
  Layers
} from 'lucide-react';
import { RepoDetails, RepoSummary, FileChange, LocalAIStatus, AICommitResult } from '../types';
import { DiffViewer } from './DiffViewer';

interface RepoInspectorProps {
  repoSummary: RepoSummary;
  aiStatus: LocalAIStatus | null;
  onClose: () => void;
  onRefreshParent: () => void;
}

export const RepoInspector: React.FC<RepoInspectorProps> = ({
  repoSummary,
  aiStatus,
  onClose,
  onRefreshParent
}) => {
  const [details, setDetails] = useState<RepoDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'changes' | 'branches' | 'history'>('changes');

  // Selected file for diff
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedDiffStaged, setSelectedDiffStaged] = useState<boolean>(false);
  const [currentDiff, setCurrentDiff] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Commit Studio state
  const [commitMessage, setCommitMessage] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiResultInfo, setAIResultInfo] = useState<AICommitResult | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Branch creation
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);

  // Load details
  const fetchDetails = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/repos/details?path=${encodeURIComponent(repoSummary.path)}`);
      if (res.ok) {
        const data = await res.json();
        setDetails(data);
        if (data.files.length > 0 && !selectedFile) {
          setSelectedFile(data.files[0].path);
          setSelectedDiffStaged(data.files[0].isStaged);
        }
      }
    } catch (err: any) {
      setStatusNotice(`Failed to load details: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [repoSummary.path]);

  // Load diff when selected file changes
  useEffect(() => {
    if (!selectedFile && details?.files?.length) {
      setSelectedFile(details.files[0].path);
      setSelectedDiffStaged(details.files[0].isStaged);
    }

    const loadDiff = async () => {
      setLoadingDiff(true);
      try {
        const url = `/api/repos/diff?path=${encodeURIComponent(repoSummary.path)}${
          selectedFile ? `&file=${encodeURIComponent(selectedFile)}` : ''
        }&staged=${selectedDiffStaged}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setCurrentDiff(data.diff || '');
        }
      } catch (err) {
        setCurrentDiff('');
      } finally {
        setLoadingDiff(false);
      }
    };

    loadDiff();
  }, [selectedFile, selectedDiffStaged, repoSummary.path]);

  // Stage single file
  const handleStageFile = async (filePath: string) => {
    try {
      const res = await fetch('/api/repos/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, files: [filePath] })
      });
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        setSelectedDiffStaged(true);
        onRefreshParent();
      }
    } catch (err: any) {
      setStatusNotice(`Stage failed: ${err.message}`);
    }
  };

  // Unstage single file
  const handleUnstageFile = async (filePath: string) => {
    try {
      const res = await fetch('/api/repos/unstage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, files: [filePath] })
      });
      if (res.ok) {
        const data = await res.json();
        setDetails(data.updated);
        setSelectedDiffStaged(false);
        onRefreshParent();
      }
    } catch (err: any) {
      setStatusNotice(`Unstage failed: ${err.message}`);
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
        setSelectedDiffStaged(true);
        onRefreshParent();
      }
    } catch (err: any) {
      setStatusNotice(`Stage all failed: ${err.message}`);
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
        setSelectedDiffStaged(false);
        onRefreshParent();
      }
    } catch (err: any) {
      setStatusNotice(`Unstage all failed: ${err.message}`);
    }
  };

  // Generate Commit Message with AI
  const handleGenerateAICommit = async () => {
    setIsGeneratingAI(true);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/ai/generate-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: repoSummary.path,
          provider: aiStatus?.provider,
          model: aiStatus?.activeModel
        })
      });
      if (res.ok) {
        const data: AICommitResult = await res.json();
        setCommitMessage(data.message);
        setAIResultInfo(data);
      }
    } catch (err: any) {
      setStatusNotice(`AI generation failed: ${err.message}`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Commit
  const handleCommit = async (andPush = false) => {
    if (!commitMessage.trim()) {
      setStatusNotice('Please enter a commit message');
      return;
    }

    setIsCommitting(true);
    setStatusNotice(null);
    try {
      // First ensure something is staged; if nothing is staged, auto stage all
      if (details?.stagedCount === 0) {
        await fetch('/api/repos/stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: repoSummary.path, files: ['.'] })
        });
      }

      const res = await fetch('/api/repos/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, message: commitMessage.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        setCommitMessage('');
        setAIResultInfo(null);
        setDetails(data.updated);
        setStatusNotice(`Committed: ${data.commitHash}`);

        if (andPush) {
          await handlePush();
        }
        onRefreshParent();
      } else {
        const errData = await res.json();
        setStatusNotice(`Commit failed: ${errData.error}`);
      }
    } catch (err: any) {
      setStatusNotice(`Commit error: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  // Pull / Sync
  const handlePull = async () => {
    setIsSyncing(true);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/repos/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path })
      });
      const data = await res.json();
      if (res.ok) {
        setDetails(data.updated);
        setStatusNotice(data.output || 'Pulled updates successfully');
        onRefreshParent();
      } else {
        setStatusNotice(`Pull failed: ${data.error}`);
      }
    } catch (err: any) {
      setStatusNotice(`Pull error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Push
  const handlePush = async () => {
    setIsSyncing(true);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/repos/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path })
      });
      const data = await res.json();
      if (res.ok) {
        setDetails(data.updated);
        setStatusNotice(data.output || 'Pushed successfully');
        onRefreshParent();
      } else {
        setStatusNotice(`Push failed: ${data.error}`);
      }
    } catch (err: any) {
      setStatusNotice(`Push error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Checkout branch
  const handleCheckoutBranch = async (branchName: string) => {
    try {
      const res = await fetch('/api/repos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, branch: branchName, createNew: false })
      });
      const data = await res.json();
      if (res.ok) {
        setDetails(data.updated);
        setStatusNotice(data.output);
        onRefreshParent();
      } else {
        setStatusNotice(`Checkout failed: ${data.error}`);
      }
    } catch (err: any) {
      setStatusNotice(`Checkout error: ${err.message}`);
    }
  };

  // Create branch
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;

    try {
      const res = await fetch('/api/repos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, branch: newBranchName.trim(), createNew: true })
      });
      const data = await res.json();
      if (res.ok) {
        setDetails(data.updated);
        setNewBranchName('');
        setIsCreatingBranch(false);
        setStatusNotice(data.output);
        onRefreshParent();
      } else {
        setStatusNotice(`Create branch failed: ${data.error}`);
      }
    } catch (err: any) {
      setStatusNotice(`Create branch error: ${err.message}`);
    }
  };

  const stagedFiles = details?.files.filter(f => f.isStaged) || [];
  const unstagedFiles = details?.files.filter(f => !f.isStaged) || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Modal Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{repoSummary.name}</h2>
                <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-indigo-300">
                  <GitBranch className="w-3 h-3" />
                  <span>{details?.currentBranch || repoSummary.currentBranch}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 font-mono truncate max-w-md">{repoSummary.path}</p>
            </div>
          </div>

          {/* Quick Remote Sync Buttons & Close */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePull}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition disabled:opacity-50"
              title="Pull from remote"
            >
              <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
              <span>Pull</span>
            </button>

            <button
              onClick={handlePush}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition disabled:opacity-50"
              title="Push to remote"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-sky-400" />
              <span>Push</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('changes')}
              className={`py-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition ${
                activeTab === 'changes'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileEdit className="w-4 h-4" />
              <span>Changes & AI Commit</span>
              {(details?.files.length ?? 0) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px]">
                  {details?.files.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('branches')}
              className={`py-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition ${
                activeTab === 'branches'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              <span>Branches & Remotes</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`py-3 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition ${
                activeTab === 'history'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Commit History</span>
            </button>
          </div>

          {/* Toast / Status notice */}
          {statusNotice && (
            <div className="text-xs font-mono px-3 py-1 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 flex items-center gap-2">
              <span>{statusNotice}</span>
              <button onClick={() => setStatusNotice(null)} className="text-slate-400 hover:text-white">×</button>
            </div>
          )}
        </div>

        {/* Tab 1: Changes & AI Commit */}
        {activeTab === 'changes' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Files List */}
            <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/50">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Working Tree Files</span>
                <div className="flex gap-2">
                  <button
                    onClick={handleStageAll}
                    className="hover:text-indigo-400 transition"
                    title="Stage all files"
                  >
                    Stage All
                  </button>
                  <span>•</span>
                  <button
                    onClick={handleUnstageAll}
                    className="hover:text-rose-400 transition"
                    title="Unstage all files"
                  >
                    Unstage All
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-4">
                {/* Staged files group */}
                {stagedFiles.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[11px] font-semibold uppercase text-emerald-400 flex items-center justify-between">
                      <span>Staged Changes ({stagedFiles.length})</span>
                    </div>
                    <div className="space-y-1 mt-1">
                      {stagedFiles.map(file => {
                        const isSelected = selectedFile === file.path && selectedDiffStaged;
                        return (
                          <div
                            key={'staged-' + file.path}
                            onClick={() => {
                              setSelectedFile(file.path);
                              setSelectedDiffStaged(true);
                            }}
                            className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                              isSelected
                                ? 'bg-indigo-600/20 text-white border border-indigo-500/40'
                                : 'hover:bg-slate-800/60 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnstageFile(file.path);
                                }}
                                className="text-emerald-400 hover:text-emerald-300 p-0.5"
                                title="Click to unstage"
                              >
                                <CheckSquare className="w-3.5 h-3.5" />
                              </span>
                              <span className="truncate font-mono">{file.path}</span>
                            </div>
                            <span className="text-[10px] text-emerald-400 uppercase font-mono">
                              {file.indexStatus}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Unstaged files group */}
                <div>
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase text-amber-400 flex items-center justify-between">
                    <span>Unstaged Changes ({unstagedFiles.length})</span>
                  </div>
                  {unstagedFiles.length === 0 && stagedFiles.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Working tree clean ✨
                    </div>
                  ) : (
                    <div className="space-y-1 mt-1">
                      {unstagedFiles.map(file => {
                        const isSelected = selectedFile === file.path && !selectedDiffStaged;
                        return (
                          <div
                            key={'unstaged-' + file.path}
                            onClick={() => {
                              setSelectedFile(file.path);
                              setSelectedDiffStaged(false);
                            }}
                            className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                              isSelected
                                ? 'bg-indigo-600/20 text-white border border-indigo-500/40'
                                : 'hover:bg-slate-800/60 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStageFile(file.path);
                                }}
                                className="text-slate-500 hover:text-emerald-400 p-0.5"
                                title="Click to stage"
                              >
                                <Square className="w-3.5 h-3.5" />
                              </span>
                              <span className="truncate font-mono">{file.path}</span>
                            </div>
                            <span className="text-[10px] text-amber-400 uppercase font-mono">
                              {file.workingDirStatus}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick info footer */}
              <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-400 flex items-center justify-between">
                <span>{details?.files.length || 0} modified files</span>
                <span className="font-mono text-indigo-400">{details?.currentBranch}</span>
              </div>
            </div>

            {/* Center: Diff Viewer */}
            <div className="flex-1 flex flex-col p-4 overflow-hidden bg-slate-950/50">
              <div className="flex-1 min-h-0">
                <DiffViewer
                  diff={currentDiff}
                  filename={selectedFile || 'All files'}
                  staged={selectedDiffStaged}
                />
              </div>

              {/* Bottom: AI Commit Studio */}
              <div className="mt-4 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <GitCommit className="w-4 h-4 text-indigo-400" />
                      Commit Message
                    </span>
                    {aiResultInfo && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {aiResultInfo.source === 'local-ai' ? `⚡ ${aiResultInfo.provider} (${aiResultInfo.model})` : '🔍 Smart Heuristics'}
                      </span>
                    )}
                  </div>

                  {/* AI Generation Trigger */}
                  <button
                    type="button"
                    onClick={handleGenerateAICommit}
                    disabled={isGeneratingAI || (details?.files.length === 0)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-500 hover:opacity-90 text-white text-xs font-semibold shadow-md transition disabled:opacity-40 cursor-pointer"
                  >
                    {isGeneratingAI ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Generate with Local AI</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Message input */}
                <textarea
                  value={commitMessage}
                  onChange={e => setCommitMessage(e.target.value)}
                  placeholder="e.g. feat(auth): add OAuth2 token refresh logic..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono resize-none"
                />

                {/* Action buttons */}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {details?.stagedCount === 0 && (details?.unstagedCount ?? 0) > 0
                      ? '⚡ Tip: Committing will automatically stage all changes'
                      : ''}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCommit(false)}
                      disabled={isCommitting || !commitMessage.trim()}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50"
                    >
                      {isCommitting ? 'Committing...' : 'Commit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCommit(true)}
                      disabled={isCommitting || isSyncing || !commitMessage.trim()}
                      className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />
                      <span>Commit & Push</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Branches & Remotes */}
        {activeTab === 'branches' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {/* Create branch bar */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" /> Create New Branch
              </h3>
              <form onSubmit={handleCreateBranch} className="flex gap-3">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                  placeholder="feature/new-awesome-feature"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!newBranchName.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                >
                  Create & Switch
                </button>
              </form>
            </div>

            {/* Local branches list */}
            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-3">
                Local Branches ({details?.branches.local.length || 0})
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {details?.branches.local.map(b => {
                  const isCurrent = b === details.currentBranch;
                  return (
                    <div
                      key={b}
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        isCurrent
                          ? 'bg-indigo-600/10 border-indigo-500/40 text-indigo-300'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <GitBranch className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span className="font-mono text-xs font-semibold truncate">{b}</span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-bold uppercase">
                            Current
                          </span>
                        )}
                      </div>
                      {!isCurrent && (
                        <button
                          onClick={() => handleCheckoutBranch(b)}
                          className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                        >
                          Switch
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Remotes list */}
            <div>
              <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-3">
                Configured Remotes ({details?.remotes.length || 0})
              </h3>
              <div className="space-y-2">
                {details?.remotes.map(r => (
                  <div key={r.name} className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono">
                    <div className="font-bold text-indigo-400 mb-1">{r.name}</div>
                    <div className="text-slate-400 text-[11px] truncate">Fetch: {r.fetchUrl}</div>
                    <div className="text-slate-400 text-[11px] truncate">Push:  {r.pushUrl}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: History */}
        {activeTab === 'history' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-4">
              Recent Commits ({details?.recentCommits.length || 0})
            </h3>
            <div className="space-y-3">
              {details?.recentCommits.map(c => (
                <div
                  key={c.hash}
                  className="p-3.5 bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-xl transition flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-indigo-400">{c.hash}</span>
                      <span className="text-xs text-slate-400">• {c.author_name}</span>
                      <span className="text-xs text-slate-400">• {new Date(c.date).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-slate-200 font-mono whitespace-pre-line">{c.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
