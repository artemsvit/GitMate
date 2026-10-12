import React, { useState } from 'react';
import {
  FolderGit2,
  GitBranch,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Folder,
  ChevronDown,
  RefreshCw,
  FolderSearch,
  Layers,
  Sparkles
} from 'lucide-react';
import { RepoSummary } from '../types';

interface SidebarProps {
  repositories: RepoSummary[];
  selectedRepo: RepoSummary | null;
  onSelectRepo: (repo: RepoSummary) => void;
  currentPath: string;
  presets: { name: string; path: string }[];
  onScan: (path: string, depth: number) => void;
  isScanning: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  repositories,
  selectedRepo,
  onSelectRepo,
  currentPath,
  presets,
  onScan,
  isScanning
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'dirty' | 'ahead' | 'clean'>('all');
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [customPathInput, setCustomPathInput] = useState(currentPath);

  React.useEffect(() => {
    setCustomPathInput(currentPath);
  }, [currentPath]);

  const filteredRepos = repositories.filter(repo => {
    const matchesSearch =
      repo.name.toLowerCase().includes(search.toLowerCase()) ||
      repo.currentBranch.toLowerCase().includes(search.toLowerCase()) ||
      repo.path.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filter === 'dirty') return !repo.isClean;
    if (filter === 'ahead') return repo.ahead > 0;
    if (filter === 'clean') return repo.isClean;
    return true;
  });

  const dirtyCount = repositories.filter(r => !r.isClean).length;
  const aheadCount = repositories.filter(r => r.ahead > 0).length;
  const cleanCount = repositories.filter(r => r.isClean).length;

  const currentFolderLabel =
    presets.find(p => p.path === currentPath)?.name ||
    currentPath.split('/').filter(Boolean).pop() ||
    'Select Folder';

  return (
    <aside className="w-80 h-full flex flex-col bg-slate-950 border-r border-slate-800/80 select-none shrink-0">
      {/* Top Header / App Brand */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/30">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-slate-100 tracking-tight">Gitler</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 font-mono border border-indigo-500/20">
                PRO
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => onScan(currentPath, 3)}
          disabled={isScanning}
          title="Rescan current folder"
          className="p-1.5 rounded-md hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 transition disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Folder Switcher Dropdown */}
      <div className="p-2.5 border-b border-slate-800/80 bg-slate-900/40">
        <div className="relative">
          <button
            onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs text-slate-200 transition"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-medium truncate">{currentFolderLabel}</span>
              <span className="text-[10px] text-slate-500 font-mono shrink-0">({repositories.length})</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-1" />
          </button>

          {/* Dropdown Menu */}
          {isFolderDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 text-xs animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-500">
                Quick Locations
              </div>
              {presets.map(p => (
                <button
                  key={p.path}
                  onClick={() => {
                    setIsFolderDropdownOpen(false);
                    onScan(p.path, 3);
                  }}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition ${
                    p.path === currentPath
                      ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                      : 'hover:bg-slate-800/70 text-slate-300'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  {p.path === currentPath && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                </button>
              ))}

              <div className="mt-1 pt-1 border-t border-slate-800/80 p-1">
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    setIsFolderDropdownOpen(false);
                    if (customPathInput.trim()) onScan(customPathInput.trim(), 3);
                  }}
                  className="flex gap-1"
                >
                  <input
                    type="text"
                    value={customPathInput}
                    onChange={e => setCustomPathInput(e.target.value)}
                    placeholder="Custom directory..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium"
                  >
                    Go
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="p-2 border-b border-slate-800/80 bg-slate-950">
        <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-900/80 rounded-lg border border-slate-800/80 text-[11px]">
          <button
            onClick={() => setFilter('all')}
            className={`py-1 rounded font-medium transition text-center ${
              filter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All <span className="text-[10px] opacity-70">({repositories.length})</span>
          </button>
          <button
            onClick={() => setFilter('dirty')}
            className={`py-1 rounded font-medium transition text-center ${
              filter === 'dirty'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dirty <span className="text-[10px] opacity-70">({dirtyCount})</span>
          </button>
          <button
            onClick={() => setFilter('ahead')}
            className={`py-1 rounded font-medium transition text-center ${
              filter === 'ahead'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ahead <span className="text-[10px] opacity-70">({aheadCount})</span>
          </button>
          <button
            onClick={() => setFilter('clean')}
            className={`py-1 rounded font-medium transition text-center ${
              filter === 'clean'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Clean <span className="text-[10px] opacity-70">({cleanCount})</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-2">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search repositories..."
            className="w-full bg-slate-900 border border-slate-800/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60"
          />
        </div>
      </div>

      {/* Repositories List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {isScanning ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-400 mb-2" />
            <span>Scanning folder...</span>
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No repositories found
          </div>
        ) : (
          filteredRepos.map(repo => {
            const isSelected = selectedRepo?.path === repo.path;
            const changes = repo.stagedCount + repo.unstagedCount;

            return (
              <div
                key={repo.path}
                onClick={() => onSelectRepo(repo)}
                className={`group flex items-start gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition border ${
                  isSelected
                    ? 'bg-indigo-600/15 border-indigo-500/40 text-white shadow-sm'
                    : 'border-transparent hover:bg-slate-900/80 text-slate-300'
                }`}
              >
                {/* Status Dot */}
                <div className="mt-1 shrink-0">
                  {!repo.isClean ? (
                    <span className="block w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/20" title="Uncommitted changes" />
                  ) : repo.ahead > 0 ? (
                    <span className="block w-2 h-2 rounded-full bg-sky-400 ring-2 ring-sky-400/20" title="Ahead of remote" />
                  ) : repo.behind > 0 ? (
                    <span className="block w-2 h-2 rounded-full bg-rose-400 ring-2 ring-rose-400/20" title="Behind remote" />
                  ) : (
                    <span className="block w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20" title="Clean" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="font-semibold text-xs truncate group-hover:text-indigo-200 transition">
                      {repo.name}
                    </span>
                    {changes > 0 ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                        {changes}
                      </span>
                    ) : repo.ahead > 0 ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/20">
                        +{repo.ahead}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                    <GitBranch className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="truncate">{repo.currentBranch}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
