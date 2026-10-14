import { appVersion } from '../version';
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
  Check,
  ArrowRight,
  Settings,
  CornerDownRight,
  Lock
} from 'lucide-react';
import { RepoSummary, WorktreeSummary } from '../types';
import { apiFetch } from '../api';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ConfirmDialog } from './ConfirmDialog';

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
  onOpenSettings: () => void;
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
  onOpenSettings,
  width = 420
}) => {
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [removing, setRemoving] = useState<{ repo: RepoSummary; tree: WorktreeSummary; force: boolean } | null>(null);
  const [actionError, setActionError] = useState('');
  const electron = (window as any).electronAPI;
  const folderItems = (folder: string): MenuItem[] => [
    { label: 'Show in Finder', onSelect: () => { electron?.showInFinder(folder).catch(() => {}); }, disabled: !electron },
    { label: 'Open in Terminal', onSelect: () => { electron?.openInTerminal(folder).catch(() => {}); }, disabled: !electron }
  ];
  const worktreeAction = async (repo: RepoSummary, action: 'remove' | 'lock' | 'prune', body: Record<string, unknown> = {}) => {
    setActionError('');
    try {
      const res = await apiFetch(`/api/repos/worktrees/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: repo.path, ...body }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      onScan(currentPath, 3);
    } catch (error: any) {
      // A worktree with uncommitted changes needs a second, explicit confirmation.
      if (action === 'remove' && body.force !== true && /modified|untracked|contains|not clean/i.test(error.message)) {
        const tree = (repo.worktrees || []).find(item => item.path === body.target);
        if (tree) { setRemoving({ repo, tree, force: true }); return; }
      }
      setActionError(error.message || 'The worktree action failed.');
    }
  };
  const worktreeItems = (repo: RepoSummary, tree: WorktreeSummary): MenuItem[] => tree.missing
    ? [{ label: 'Clean up missing worktrees', onSelect: () => { void worktreeAction(repo, 'prune'); } }]
    : [
      ...folderItems(tree.path),
      { label: tree.worktree.locked !== null ? 'Unlock' : 'Lock', separatorBefore: true, onSelect: () => { void worktreeAction(repo, 'lock', { target: tree.path, locked: tree.worktree.locked === null, reason: 'Locked in Git Mate' }); } },
      { label: 'Remove Worktree…', destructive: true, disabled: tree.worktree.locked !== null, onSelect: () => setRemoving({ repo, tree, force: false }) }
    ];
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
      {/* Top Header: Brand, Version Tag, Theme Switcher & Settings */}
      <div
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        className="h-12 pl-[92px] pr-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-canvas)] select-none"
      >
        <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="w-6 h-6 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-violet)]">
            <Terminal className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-[var(--text-primary)] tracking-tight whitespace-nowrap">Git Mate</span>
            {/* Version Tag */}
            <span className="px-2 py-0.5 rounded-[50px] border border-[var(--border-interactive)] bg-[var(--bg-surface)] text-[var(--accent-violet)] text-[10px] font-mono tracking-wider">
              v{appVersion}
            </span>
          </div>
        </div>

        {/* Right side Header Controls: Theme switcher, then Settings at the far right */}
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Light / Dark Theme Switcher */}
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            className="p-1.5 rounded-full hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
            )}
          </button>

          {/* Command Center / Settings Button */}
          <button
            onClick={onOpenSettings}
            title="Command Center & Settings (Git providers, AI engine, identity)"
            className="p-1.5 rounded-full hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--accent-violet)]" />
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
              <>
              <div className="fixed inset-0 z-40" onClick={() => setIsFolderDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1.5 z-50 w-64 bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl p-1.5 text-xs shadow-xl">
                <div className="px-2.5 py-1 text-[9px] uppercase font-bold tracking-widest text-[var(--text-muted)] font-mono">
                  Locations
                </div>
                <div className="space-y-0.5 my-1">
                  {presets.map(p => (
                    <button
                      key={p.path}
                      onClick={() => {
                        setIsFolderDropdownOpen(false);
                        onScan(p.path, 3);
                      }}
                      title={p.path}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-[11px] transition cursor-pointer ${
                        p.path === currentPath
                          ? 'bg-[var(--bg-card)] text-[var(--text-primary)] font-semibold'
                          : 'hover:bg-[var(--bg-card)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Folder className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                        <span className="truncate">{p.name}</span>
                      </span>
                      {p.path === currentPath && <Check className="w-3 h-3 shrink-0 text-[var(--accent-violet)]" />}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={e => {
                    e.preventDefault();
                    setIsFolderDropdownOpen(false);
                    if (customPathInput.trim()) onScan(customPathInput.trim(), 3);
                  }}
                  className="mt-1 pt-2 px-1 pb-1 border-t border-[var(--border-subtle)] space-y-1.5"
                >
                  <label htmlFor="custom-folder-path" className="block px-1.5 text-[10px] text-[var(--text-muted)]">Go to folder</label>
                  <div className="flex items-center gap-1 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-full pl-3 pr-1 py-1 focus-within:border-[var(--accent-violet)]">
                    <input
                      id="custom-folder-path"
                      type="text"
                      value={customPathInput}
                      onChange={e => setCustomPathInput(e.target.value)}
                      placeholder="/Users/you/Projects"
                      className="flex-1 min-w-0 bg-transparent text-[11px] text-[var(--text-primary)] font-mono placeholder:text-[var(--text-muted)] focus:outline-none"
                    />
                    <button
                      type="submit"
                      aria-label="Scan this folder"
                      className="shrink-0 w-6 h-6 rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] flex items-center justify-center hover:opacity-90"
                    >
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </form>
              </div>
              </>
            )}
          </div>

          {/* Quick Finder Action Button */}
          <button
            onClick={() => onBrowseFolder(currentPath)}
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
            aria-label="Search repositories"
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

        {/* Rescan Button, opposite the filter */}
        <button
          onClick={() => onScan(currentPath, 3)}
          disabled={isScanning}
          title="Rescan current folder"
          aria-label="Rescan current folder"
          className="p-1.5 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] border border-[var(--border-interactive)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer disabled:opacity-30"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
        </button>
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
              <React.Fragment key={repo.path}>
              <button
                type="button"
                onContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, items: folderItems(repo.path) }); }}
                aria-pressed={isSelected}
                aria-label={`Select repository ${repo.name}, branch ${repo.currentBranch}`}
                onClick={() => onSelectRepo(repo)}
                className={`group w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition border ${
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
                        title={`${changes} staged and unstaged file changes`}
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
              </button>
              {/* Linked worktrees, for example ones created by AI coding agents, sit under their repository. */}
              {(repo.worktrees || []).map(tree => {
                const treeChanges = tree.missing ? 0 : tree.stagedCount + tree.unstagedCount;
                const selected = selectedRepo?.path === tree.path;
                return <button
                  type="button"
                  key={tree.path}
                  disabled={tree.missing}
                  title={tree.path}
                  aria-label={`Select worktree ${tree.name}`}
                  onClick={() => onSelectRepo(tree)}
                  onContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, items: worktreeItems(repo, tree) }); }}
                  className={`w-full text-left flex items-center gap-2 pl-7 pr-3 py-1.5 rounded-xl transition border ${selected ? 'bg-[var(--bg-card)] border-[var(--border-interactive)]' : 'border-transparent hover:bg-[var(--bg-surface)]'} disabled:opacity-50`}
                >
                  <CornerDownRight className="w-3 h-3 shrink-0 text-[var(--text-dim)]" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                      <span className="truncate">{tree.name}</span>
                      {tree.worktree.locked !== null && <Lock className="w-2.5 h-2.5 shrink-0 text-[var(--text-muted)]" aria-label="Locked" />}
                    </span>
                    <span className="block text-[10px] font-mono text-[var(--text-muted)] truncate">{tree.missing ? 'missing · right-click to clean up' : tree.worktree.branch || `detached · ${(tree.worktree.head || '').slice(0, 7)}`}</span>
                  </span>
                  {treeChanges > 0 && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[50px] border border-[var(--status-dirty)]/30 bg-[var(--status-dirty-bg)] text-[var(--status-dirty)] font-semibold">{treeChanges}</span>}
                </button>;
              })}
              </React.Fragment>
            );
          })
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      <ConfirmDialog open={!!removing} title="Remove this worktree?" destructive confirmLabel={removing?.force ? 'Remove with changes' : 'Remove'}
        message={<>The folder <span className="font-mono break-all">{removing?.tree.path}</span> is deleted. The branch {removing?.tree.worktree.branch ? <span className="font-mono">{removing.tree.worktree.branch}</span> : ''} and its commits stay in the repository.{removing?.force ? ' Its uncommitted changes are lost.' : ''}</>}
        onCancel={() => setRemoving(null)} onConfirm={() => { const target = removing!; setRemoving(null); void worktreeAction(target.repo, 'remove', { target: target.tree.path, force: target.force }); }} />
      {actionError && <p role="alert" className="mx-3 mb-2 text-[10px] text-rose-500 text-pretty">{actionError}</p>}
    </aside>
  );
};
