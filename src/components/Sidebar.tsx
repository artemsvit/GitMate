import React, { useState } from 'react';
import {
  GitBranch,
  Search,
  Folder,
  ChevronDown,
  RefreshCw,
  Terminal,
  Sun,
  Moon,
  ArrowLeftRight
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
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  layoutFlipped: boolean;
  onToggleLayout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  repositories,
  selectedRepo,
  onSelectRepo,
  currentPath,
  presets,
  onScan,
  isScanning,
  theme,
  onToggleTheme,
  layoutFlipped,
  onToggleLayout
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
    <aside className="w-80 h-full flex flex-col bg-[var(--bg-canvas)] border-r border-[var(--border-subtle)] select-none shrink-0 transition-colors">
      {/* Top Header: Brand, Version Tag, Theme Switcher, Layout Flip & Rescan */}
      <div className="h-12 px-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-canvas)]">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-violet)]">
            <Terminal className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-[var(--text-primary)] tracking-tight">Gitler</span>
            {/* Version Tag */}
            <span className="px-2 py-0.5 rounded-[50px] border border-[var(--border-interactive)] bg-[var(--bg-surface)] text-[var(--accent-violet)] text-[10px] font-mono tracking-wider">
              v1.0.0
            </span>
          </div>
        </div>

        {/* Right side Header Controls: Theme switcher, Swap Layout, Rescan */}
        <div className="flex items-center gap-1">
          {/* Swap Columns Toggle */}
          <button
            onClick={onToggleLayout}
            title={layoutFlipped ? 'Move Repositories to left' : 'Move Repositories to right'}
            className="p-1.5 rounded-full hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>

          {/* Light / Dark Theme Switcher */}
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            className="p-1.5 rounded-full hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
            )}
          </button>

          {/* Rescan Button */}
          <button
            onClick={() => onScan(currentPath, 3)}
            disabled={isScanning}
            title="Rescan current folder"
            className="p-1.5 rounded-full hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition disabled:opacity-30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Folder Switcher */}
      <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
        <div className="relative">
          <button
            onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-[33px] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] transition"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Folder className="w-3.5 h-3.5 text-[var(--accent-violet)] shrink-0" />
              <span className="font-medium truncate text-[11px]">{currentFolderLabel}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono shrink-0">({repositories.length})</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 ml-1" />
          </button>

          {/* Folder Menu */}
          {isFolderDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl p-1.5 text-xs shadow-none">
              <div className="px-2.5 py-1 text-[9px] uppercase font-bold tracking-widest text-[var(--text-muted)]">
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
                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] font-medium'
                      : 'hover:bg-[var(--bg-card)] text-[var(--text-secondary)]'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  {p.path === currentPath && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-violet)]" />}
                </button>
              ))}

              <div className="mt-1 pt-1 border-t border-[var(--border-subtle)] p-1">
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
                    className="flex-1 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-[33px] px-2.5 py-1 text-[11px] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent-violet)]"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-[33px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-[10px] font-semibold"
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
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-[var(--border-interactive)] rounded-[33px] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none transition"
          />
        </div>
      </div>

      {/* Filter Pill Tags */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1.5 overflow-x-auto scrollbar-none bg-[var(--bg-canvas)]">
        <button
          onClick={() => setFilter('all')}
          className={`px-2.5 py-1 rounded-[50px] text-[10px] font-mono uppercase tracking-wider transition ${
            filter === 'all'
              ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold'
              : 'border border-[var(--border-interactive)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]'
          }`}
        >
          All ({repositories.length})
        </button>

        <button
          onClick={() => setFilter('dirty')}
          className={`px-2.5 py-1 rounded-[50px] text-[10px] font-mono uppercase tracking-wider transition ${
            filter === 'dirty'
              ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold'
              : 'border border-[var(--border-interactive)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]'
          }`}
        >
          Dirty ({dirtyCount})
        </button>

        <button
          onClick={() => setFilter('ahead')}
          className={`px-2.5 py-1 rounded-[50px] text-[10px] font-mono uppercase tracking-wider transition ${
            filter === 'ahead'
              ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold'
              : 'border border-[var(--border-interactive)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]'
          }`}
        >
          Ahead ({aheadCount})
        </button>

        <button
          onClick={() => setFilter('clean')}
          className={`px-2.5 py-1 rounded-[50px] text-[10px] font-mono uppercase tracking-wider transition ${
            filter === 'clean'
              ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold'
              : 'border border-[var(--border-interactive)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]'
          }`}
        >
          Clean ({cleanCount})
        </button>
      </div>

      {/* Repository Items List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isScanning ? (
          <div className="py-16 flex flex-col items-center justify-center text-[var(--text-muted)] text-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent-violet)] mb-2" />
            <span className="font-mono text-[11px]">Scanning repositories...</span>
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="py-16 text-center text-xs text-[var(--text-muted)] font-mono">
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
                    ? 'bg-[var(--bg-card)] border-[var(--border-interactive)] text-[var(--text-primary)]'
                    : 'border-transparent hover:bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                }`}
              >
                {/* Status Dot */}
                <div className="mt-1.5 shrink-0">
                  {!repo.isClean ? (
                    <span className="block w-2 h-2 rounded-full bg-[var(--text-primary)] ring-2 ring-[var(--border-interactive)]" title="Uncommitted changes" />
                  ) : repo.ahead > 0 ? (
                    <span className="block w-2 h-2 rounded-full bg-[var(--accent-violet)]" title="Ahead of remote" />
                  ) : repo.behind > 0 ? (
                    <span className="block w-2 h-2 rounded-full bg-[var(--text-muted)]" title="Behind remote" />
                  ) : (
                    <span className="block w-2 h-2 rounded-full bg-[var(--border-interactive)]" title="Clean" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="font-medium text-xs truncate text-[var(--text-primary)]">
                      {repo.name}
                    </span>
                    {changes > 0 ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-[50px] border border-[var(--border-interactive)] bg-[var(--bg-canvas)] text-[var(--text-primary)]">
                        {changes}
                      </span>
                    ) : repo.ahead > 0 ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-[50px] border border-[var(--border-interactive)] bg-[var(--bg-canvas)] text-[var(--accent-violet)]">
                        +{repo.ahead}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-mono">
                    <GitBranch className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
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
