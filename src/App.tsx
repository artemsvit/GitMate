import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { FolderSelector } from './components/FolderSelector';
import { RepoCard } from './components/RepoCard';
import { RepoInspector } from './components/RepoInspector';
import { AISettingsModal } from './components/AISettingsModal';
import { RepoSummary, LocalAIStatus } from './types';
import {
  FolderGit2,
  Filter,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  Layers,
  Search,
  Sparkles
} from 'lucide-react';

export function App() {
  const [currentPath, setCurrentPath] = useState('');
  const [presets, setPresets] = useState<{ name: string; path: string }[]>([]);
  const [repositories, setRepositories] = useState<RepoSummary[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'dirty' | 'ahead' | 'clean'>('all');

  // Selected Repo for Inspector
  const [selectedRepo, setSelectedRepo] = useState<RepoSummary | null>(null);

  // AI & Modals
  const [aiStatus, setAIStatus] = useState<LocalAIStatus | null>(null);
  const [aiSettingsOpen, setAISettingsOpen] = useState(false);
  const [syncingRepoPath, setSyncingRepoPath] = useState<string | null>(null);

  // 1. Initial Load: System folders & AI status
  useEffect(() => {
    const init = async () => {
      try {
        const [folderRes, aiRes] = await Promise.all([
          fetch('/api/system/folders'),
          fetch('/api/ai/status')
        ]);

        if (folderRes.ok) {
          const folderData = await folderRes.json();
          setPresets(folderData.folders || []);
          if (folderData.folders?.length > 0) {
            const defaultFolder = folderData.folders[0].path;
            setCurrentPath(defaultFolder);
            // Trigger initial scan
            handleScan(defaultFolder, 3);
          }
        }

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          setAIStatus(aiData);
        }
      } catch (err) {
        console.error('Initial load failed:', err);
      }
    };

    init();
  }, []);

  // 2. Scan repositories in target path
  const handleScan = async (path: string, depth = 3) => {
    setIsScanning(true);
    setScanNotice(null);
    setCurrentPath(path);

    try {
      const res = await fetch('/api/repos/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootDir: path, maxDepth: depth })
      });

      if (res.ok) {
        const data = await res.json();
        setRepositories(data.repositories || []);
        if (data.repositories.length === 0) {
          setScanNotice(`No Git repositories found in "${path}" (depth ${depth}). Try choosing another folder.`);
        }
      } else {
        const err = await res.json();
        setScanNotice(`Scan error: ${err.error}`);
      }
    } catch (err: any) {
      setScanNotice(`Network or server error: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  // 3. Quick Sync (Pull & Push) from card
  const handleQuickSync = async (repo: RepoSummary) => {
    setSyncingRepoPath(repo.path);
    try {
      // Pull
      await fetch('/api/repos/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repo.path })
      });

      // Push if ahead
      if (repo.ahead > 0) {
        await fetch('/api/repos/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: repo.path })
        });
      }

      // Re-scan current folder to update all cards
      handleScan(currentPath);
    } catch (err) {
      console.error('Quick sync failed:', err);
    } finally {
      setSyncingRepoPath(null);
    }
  };

  const refreshAIStatus = async () => {
    try {
      const res = await fetch('/api/ai/status');
      if (res.ok) {
        setAIStatus(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filter & Search Logic
  const filteredRepos = repositories.filter(repo => {
    const matchesSearch =
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.currentBranch.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === 'dirty') return !repo.isClean;
    if (filterType === 'ahead') return repo.ahead > 0;
    if (filterType === 'clean') return repo.isClean;
    return true;
  });

  const dirtyCount = repositories.filter(r => !r.isClean).length;
  const aheadCount = repositories.filter(r => r.ahead > 0).length;
  const cleanCount = repositories.filter(r => r.isClean).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <Header
        aiStatus={aiStatus}
        onOpenAISettings={() => setAISettingsOpen(true)}
        onRefreshAll={() => handleScan(currentPath)}
        isScanning={isScanning}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* Folder Scanner Selector */}
        <FolderSelector
          currentPath={currentPath}
          presets={presets}
          isScanning={isScanning}
          onScan={(p, d) => handleScan(p, d)}
        />

        {/* Dashboard Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4">
          
          {/* Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                filterType === 'all'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Repositories ({repositories.length})</span>
            </button>

            <button
              onClick={() => setFilterType('dirty')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                filterType === 'dirty'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Uncommitted ({dirtyCount})</span>
            </button>

            <button
              onClick={() => setFilterType('ahead')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                filterType === 'ahead'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                  : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-sky-400" />
              <span>Ahead of Remote ({aheadCount})</span>
            </button>

            <button
              onClick={() => setFilterType('clean')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                filterType === 'clean'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Clean ({cleanCount})</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by repo or branch..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Notice alert */}
        {scanNotice && (
          <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-xs flex items-center justify-between">
            <span>{scanNotice}</span>
            <button onClick={() => setScanNotice(null)} className="text-slate-400 hover:text-white font-bold ml-2">×</button>
          </div>
        )}

        {/* Repositories Grid */}
        {isScanning ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500">
            <div className="w-10 h-10 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
            <p className="text-sm font-semibold text-slate-300">Scanning directory for Git repositories...</p>
            <p className="text-xs text-slate-500 mt-1">Analyzing branch statuses, remotes, and dirty working trees</p>
          </div>
        ) : filteredRepos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRepos.map(repo => (
              <RepoCard
                key={repo.path}
                repo={repo}
                onInspect={r => setSelectedRepo(r)}
                onQuickSync={r => handleQuickSync(r)}
                isSyncing={syncingRepoPath === repo.path}
              />
            ))}
          </div>
        ) : (
          <div className="py-20 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center p-8">
            <FolderGit2 className="w-12 h-12 text-slate-600 mb-3" />
            <h3 className="text-base font-bold text-slate-300">No Git repositories match your filter</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              {repositories.length === 0
                ? 'Try scanning a different folder or increase scan depth.'
                : 'Try clearing your search query or switching the status filter.'}
            </p>
          </div>
        )}
      </main>

      {/* Repository Inspector Modal */}
      {selectedRepo && (
        <RepoInspector
          repoSummary={selectedRepo}
          aiStatus={aiStatus}
          onClose={() => setSelectedRepo(null)}
          onRefreshParent={() => handleScan(currentPath)}
        />
      )}

      {/* Local AI Settings Modal */}
      {aiSettingsOpen && (
        <AISettingsModal
          aiStatus={aiStatus}
          onClose={() => setAISettingsOpen(false)}
          onRefreshStatus={refreshAIStatus}
        />
      )}
    </div>
  );
}
