import React, { useState } from 'react';
import {
  GitBranch,
  Search,
  Folder,
  ChevronDown,
  RefreshCw,
  Sparkles,
  Terminal
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
    <aside className="w-80 h-full flex flex-col bg-[#000000] border-r border-[#1e1e1d] select-none shrink-0">
      {/* Brand & Window Header */}
      <div className="h-12 px-4 border-b border-[#1e1e1d] flex items-center justify-between bg-[#000000]">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-[#121212] border border-[#1e1e1d] flex items-center justify-center text-[#cbb0f7]">
            <Terminal className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-[#faf9f6] tracking-tight">Gitler</span>
            <span className="px-2 py-0.5 rounded-[50px] border border-[#333333] bg-[#121212] text-[#cbb0f7] text-[10px] font-mono tracking-wider">
              WARP.DS
            </span>
          </div>
        </div>

        <button
          onClick={() => onScan(currentPath, 3)}
          disabled={isScanning}
          title="Rescan current folder"
          className="p-1.5 rounded-full hover:bg-[#1e1e1d] text-[#868684] hover:text-[#faf9f6] transition disabled:opacity-30"
        >
          <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Folder Switcher */}
      <div className="p-3 border-b border-[#1e1e1d] bg-[#000000]">
        <div className="relative">
          <button
            onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-[33px] bg-[#121212] hover:bg-[#1e1e1d] border border-[#1e1e1d] text-xs text-[#faf9f6] transition"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Folder className="w-3.5 h-3.5 text-[#cbb0f7] shrink-0" />
              <span className="font-medium truncate text-[11px]">{currentFolderLabel}</span>
              <span className="text-[10px] text-[#868684] font-mono shrink-0">({repositories.length})</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#868684] shrink-0 ml-1" />
          </button>

          {/* Folder Menu */}
          {isFolderDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#121212] border border-[#333333] rounded-2xl p-1.5 text-xs shadow-none">
              <div className="px-2.5 py-1 text-[9px] uppercase font-bold tracking-widest text-[#868684]">
                Locations
              </div>
              {presets.map(p => (
                <button
                  key={p.path}
                  onClick={() => {
                    setIsFolderDropdownOpen(false);
                    onScan(p.path, 3);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[11px] transition ${
                    p.path === currentPath
                      ? 'bg-[#1e1e1d] text-[#faf9f6] font-medium'
                      : 'hover:bg-[#1e1e1d] text-[#b4b4b2]'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  {p.path === currentPath && <span className="w-1.5 h-1.5 rounded-full bg-[#cbb0f7]" />}
                </button>
              ))}

              <div className="mt-1 pt-1 border-t border-[#1e1e1d] p-1">
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
                    placeholder="Custom path..."
                    className="flex-1 bg-[#000000] border border-[#333333] rounded-[33px] px-2.5 py-1 text-[11px] text-[#faf9f6] font-mono focus:outline-none focus:border-[#cbb0f7]"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-[33px] bg-[#faf9f6] hover:bg-[#ffffff] text-[#080808] text-[10px] font-semibold"
                  >
                    Go
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative mt-2">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#868684]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full bg-[#121212] border border-[#1e1e1d] focus:border-[#333333] rounded-[33px] pl-8 pr-3 py-1.5 text-xs text-[#faf9f6] placeholder-[#868684] focus:outline-none transition"
          />
        </div>
      </div>

      {/* Filter Pill Tags */}
      <div className="px-3 py-2 border-b border-[#1e1e1d] flex items-center gap-1.5 overflow-x-auto scrollbar-none bg-[#000000]">
        <button
          onClick={() => setFilter('all')}
          className={`px-2.5 py-1 rounded-[50px] text-[10px] font-mono uppercase tracking-wider transition ${
            filter === 'all'
              ? 'bg-[#faf9f6] text-[#080808] font-semibold'
              : 'border border-[#333333] text-[#868684] hover:text-[#faf9f6] hover:border-[#868684]'
          }`}
        >
          All ({repositories.length})
        </button>

        <button
          onClick={() => setFilter('dirty')}
          className={`px-2.5 py-1 rounded-[50px] text-[10px] font-mono uppercase tracking-wider transition ${
            filter === 'dirty'
              ? 'bg-[#faf9f6] text-[#080808] font-semibold'
              : 'border border-[#333333] text-[#868684] hover:text-[#faf9f6] hover:border-[#868684]'
          }`}
        >
          Dirty ({dirtyCount})
        </button>

        <button
          onClick={() => setFilter('ahead')}
          className={`px-2.5 py-1 rounded-[50px] text-[10px] font-mono uppercase tracking-wider transition ${
            filter === 'ahead'
              ? 'bg-[#faf9f6] text-[#080808] font-semibold'
              : 'border border-[#333333] text-[#868684] hover:text-[#faf9f6] hover:border-[#868684]'
          }`}
        >
          Ahead ({aheadCount})
        </button>

        <button
          onClick={() => setFilter('clean')}
          className={`px-2.5 py-1 rounded-[50px] text-[10px] font-mono uppercase tracking-wider transition ${
            filter === 'clean'
              ? 'bg-[#faf9f6] text-[#080808] font-semibold'
              : 'border border-[#333333] text-[#868684] hover:text-[#faf9f6] hover:border-[#868684]'
          }`}
        >
          Clean ({cleanCount})
        </button>
      </div>

      {/* Repository Items List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isScanning ? (
          <div className="py-16 flex flex-col items-center justify-center text-[#868684] text-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-[#cbb0f7] mb-2" />
            <span className="font-mono text-[11px]">Scanning repositories...</span>
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#868684] font-mono">
            No projects found
          </div>
        ) : (
          filteredRepos.map(repo => {
            const isSelected = selectedRepo?.path === repo.path;
            const changes = repo.stagedCount + repo.unstagedCount;

            return (
              <div
                key={repo.path}
                onClick={() => onSelectRepo(repo)}
                className={`group flex items-start gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition border ${
                  isSelected
                    ? 'bg-[#1e1e1d] border-[#333333] text-[#faf9f6]'
                    : 'border-transparent hover:bg-[#121212] text-[#b4b4b2]'
                }`}
              >
                {/* Status Dot */}
                <div className="mt-1.5 shrink-0">
                  {!repo.isClean ? (
                    <span className="block w-2 h-2 rounded-full bg-[#faf9f6] ring-2 ring-[#333333]" title="Uncommitted changes" />
                  ) : repo.ahead > 0 ? (
                    <span className="block w-2 h-2 rounded-full bg-[#cbb0f7]" title="Ahead of remote" />
                  ) : repo.behind > 0 ? (
                    <span className="block w-2 h-2 rounded-full bg-[#868684]" title="Behind remote" />
                  ) : (
                    <span className="block w-2 h-2 rounded-full bg-[#333333]" title="Clean" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="font-medium text-xs truncate text-[#faf9f6]">
                      {repo.name}
                    </span>
                    {changes > 0 ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-[50px] border border-[#333333] bg-[#000000] text-[#faf9f6]">
                        {changes}
                      </span>
                    ) : repo.ahead > 0 ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-[50px] border border-[#333333] bg-[#000000] text-[#cbb0f7]">
                        +{repo.ahead}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-[#868684] font-mono">
                    <GitBranch className="w-3 h-3 text-[#666469] shrink-0" />
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
