import React, { useState } from 'react';
import {
  GitBranch,
  Search,
  Folder,
  FolderOpen,
  FolderGit2,
  ChevronDown,
  RefreshCw,
  Terminal,
  Sun,
  Moon,
  AlertCircle,
  Filter,
  Check
} from 'lucide-react';
import { RepoSummary } from '../types';

interface SidebarProps {
  repositories: RepoSummary[];
  selectedRepo: RepoSummary | null;
  onSelectRepo: (repo: RepoSummary) => void;
  currentPath: string;
  presets: { name: string; path: string }[];
  onScan: (path: string, depth: number) => void;
  onBrowseFolder: (defaultPath?: string) => void;
  scanError?: string | null;
  isScanning: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  width?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  repositories,
  selectedRepo,
  onSelectRepo,
  currentPath,
  presets,
  onScan,
  onBrowseFolder,
  scanError,
  isScanning,
  theme,
  onToggleTheme,
  width = 420
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'dirty' | 'ahead' | 'behind' | 'clean'>('all');
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
    if (filter === 'behind') return repo.behind > 0;
    if (filter === 'clean') return repo.isClean;
    return true;
  });

  const dirtyCount = repositories.filter(r => !r.isClean).length;
  const aheadCount = repositories.filter(r => r.ahead > 0).length;
  const behindCount = repositories.filter(r => r.behind > 0).length;
  const cleanCount = repositories.filter(r => r.isClean).length;

  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  const filterOptions: {
    key: 'all' | 'dirty' | 'ahead' | 'behind' | 'clean';
    label: string;
    count: number;
    dotColor?: string;
  }[] = [
    { key: 'all', label: 'All', count: repositories.length },
    { key: 'dirty', label: 'Dirty', count: dirtyCount, dotColor: 'bg-[var(--status-dirty)]' },
    { key: 'ahead', label: 'Ahead', count: aheadCount, dotColor: 'bg-[var(--status-ahead)]' },
    { key: 'behind', label: 'Behind', count: behindCount, dotColor: 'bg-[var(--status-behind)]' },
    { key: 'clean', label: 'Clean', count: cleanCount, dotColor: 'bg-[var(--status-clean)]' }
  ];

  const currentFilterOption = filterOptions.find(o => o.key === filter) || filterOptions[0];

  const currentFolderLabel =
    presets.find(p => p.path === currentPath)?.name ||
    currentPath.split('/').filter(Boolean).pop() ||
    'Select Folder';

  return (
    <aside
      style={{ width }}
      className="h-full flex flex-col bg-[var(--bg-canvas)] select-none shrink-0 transition-colors"
    >
      {/* Top Header: Brand, Version Tag, Theme Switcher & Rescan */}
      <div
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        className="h-12 pl-[78px] pr-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-canvas)] select-none"
      >
        <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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

        {/* Right side Header Controls: Theme switcher & Rescan */}
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
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
                {/* 1-Click Open in Mac Finder button in menu */}
                <button
                  onClick={() => {
                    setIsFolderDropdownOpen(false);
                    onBrowseFolder();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left text-[11px] font-semibold text-[var(--accent-violet)] bg-[var(--bg-card)] hover:bg-[var(--bg-canvas)] border border-[var(--border-interactive)] transition mb-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5 shrink-0 text-[var(--accent-violet)]" />
                  <span>Choose Folder in Mac Finder...</span>
                </button>

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

          {/* Quick Finder Action Button */}
          <button
            onClick={onBrowseFolder}
            title="Open native Mac Finder to select folder"
            className="px-3 py-1.5 rounded-[33px] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--accent-violet)] text-[var(--text-primary)] text-xs flex items-center gap-1.5 transition shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
            <span className="text-[11px] font-medium hidden sm:inline">Finder</span>
          </button>
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

      {/* Filter Drop List Row */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-canvas)]">
        <div className="relative">
          <button
            onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[33px] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] border border-[var(--border-interactive)] text-xs text-[var(--text-primary)] transition cursor-pointer select-none"
          >
            <Filter className="w-3.5 h-3.5 text-[var(--accent-violet)] shrink-0" />
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              {currentFilterOption.dotColor && (
                <span className={`w-1.5 h-1.5 rounded-full ${currentFilterOption.dotColor} shrink-0`} />
              )}
              <span className="font-semibold capitalize">{currentFilterOption.label}</span>
              <span className="text-[10px] text-[var(--text-muted)]">({currentFilterOption.count})</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-150 ${isFilterDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Drop List Popover */}
          {isFilterDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsFilterDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1.5 z-50 w-52 bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl p-1.5 text-xs shadow-xl animate-in fade-in duration-150">
                <div className="px-2.5 py-1 text-[9px] uppercase font-bold tracking-widest text-[var(--text-muted)] font-mono">
                  Filter by Status
                </div>
                <div className="space-y-0.5 my-1">
                  {filterOptions.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setFilter(opt.key);
                        setIsFilterDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition cursor-pointer ${
                        filter === opt.key
                          ? 'bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold'
                          : 'hover:bg-[var(--bg-card)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {opt.dotColor ? (
                          <span className={`w-2 h-2 rounded-full ${opt.dotColor} shrink-0`} />
                        ) : (
                          <span className="w-2 h-2 rounded-full border border-[var(--border-interactive)] shrink-0" />
                        )}
                        <span className="capitalize font-mono text-[11px]">{opt.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">({opt.count})</span>
                        {filter === opt.key && <Check className="w-3 h-3 text-[var(--accent-violet)]" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <span className="text-[10px] text-[var(--text-muted)] font-mono select-none">
          {filteredRepos.length} of {repositories.length} repos
        </span>
      </div>

      {/* Repository Items List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isScanning ? (
          <div className="py-16 flex flex-col items-center justify-center text-[var(--text-muted)] text-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent-violet)] mb-2" />
            <span className="font-mono text-[11px]">Scanning repositories...</span>
          </div>
        ) : scanError ? (
          <div className="p-4 mx-2 my-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--status-dirty)]/40 text-xs space-y-3">
            <div className="flex items-center gap-2 text-[var(--status-dirty)] font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Permission Notice</span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {scanError}
            </p>
            <button
              onClick={() => onBrowseFolder(currentPath)}
              className="w-full py-2 px-3 rounded-[33px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs flex items-center justify-center gap-2 transition hover:opacity-90"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Grant Access in Mac Finder</span>
            </button>
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto text-[var(--accent-violet)]">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-xs text-[var(--text-primary)]">No Repositories Found</div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
                No Git projects found in {currentFolderLabel}. Select any folder on your Mac using Finder.
              </p>
            </div>
            <button
              onClick={() => onBrowseFolder(currentPath)}
              className="py-1.5 px-4 rounded-[33px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-semibold inline-flex items-center gap-1.5 transition hover:opacity-90"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Choose Folder in Finder</span>
            </button>
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
                    ? 'bg-[var(--bg-card)] border-[var(--border-interactive)] text-[var(--text-primary)]'
                    : 'border-transparent hover:bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                }`}
              >
                {/* Status Dot with Distinct Warp Colors */}
                <div className="mt-1 shrink-0">
                  {!repo.isClean ? (
                    <span
                      className="block w-2.5 h-2.5 rounded-full bg-[var(--status-dirty)] shadow-[0_0_8px_var(--status-dirty-bg)] ring-1 ring-[var(--status-dirty)]/40"
                      title="Uncommitted changes (Working tree modified)"
                    />
                  ) : repo.ahead > 0 ? (
                    <span
                      className="block w-2.5 h-2.5 rounded-full bg-[var(--status-ahead)] shadow-[0_0_8px_var(--status-ahead-bg)] ring-1 ring-[var(--status-ahead)]/40"
                      title="Ahead of remote (Commits pending push)"
                    />
                  ) : repo.behind > 0 ? (
                    <span
                      className="block w-2.5 h-2.5 rounded-full bg-[var(--status-behind)] shadow-[0_0_8px_var(--status-behind-bg)] ring-1 ring-[var(--status-behind)]/40"
                      title="Behind remote (Updates pending pull)"
                    />
                  ) : (
                    <span
                      className="block w-2.5 h-2.5 rounded-full bg-[var(--status-clean)] shadow-[0_0_8px_var(--status-clean-bg)] ring-1 ring-[var(--status-clean)]/40"
                      title="Clean and in sync"
                    />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="font-medium text-xs truncate text-[var(--text-primary)]">
                      {repo.name}
                    </span>
                    {changes > 0 ? (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-[50px] border border-[var(--status-dirty)]/30 bg-[var(--status-dirty-bg)] text-[var(--status-dirty)] font-semibold"
                        title={`${changes} modified/uncommitted files`}
                      >
                        {changes}
                      </span>
                    ) : repo.ahead > 0 ? (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-[50px] border border-[var(--status-ahead)]/30 bg-[var(--status-ahead-bg)] text-[var(--status-ahead)] font-semibold"
                        title={`${repo.ahead} commit(s) ahead of remote`}
                      >
                        +{repo.ahead}
                      </span>
                    ) : repo.behind > 0 ? (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-[50px] border border-[var(--status-behind)]/30 bg-[var(--status-behind-bg)] text-[var(--status-behind)] font-semibold"
                        title={`${repo.behind} commit(s) behind remote`}
                      >
                        -{repo.behind}
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
