import { useRepositoryPush } from './useRepositoryPush';
import { apiFetch } from './api';
import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { Sidebar } from './components/Sidebar';
import { MainWorkspace } from './components/MainWorkspace';
import { AICopilotPanel } from './components/AICopilotPanel';
import { StatusBar } from './components/StatusBar';
import { AISettingsModal } from './components/AISettingsModal';
import { RemoteAuthModal } from './components/RemoteAuthModal';
import { SettingsModal, SettingsTab } from './components/SettingsModal';
import { RepoSummary, RepoDetails, LocalAIStatus } from './types';
import { FolderGit2, FolderOpen, ShieldAlert } from 'lucide-react';

function subscribeToViewport(listener: () => void) {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}
const getViewportWidth = () => window.innerWidth;

export function App() {
  const [currentPath, setCurrentPath] = useState('');
  const [presets, setPresets] = useState<{ name: string; path: string }[]>([]);
  const [repositories, setRepositories] = useState<RepoSummary[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<RepoSummary | null>(null);
  const [selectedRepoDetails, setSelectedRepoDetails] = useState<RepoDetails | null>(null);
  const [permissionPromptFolder, setPermissionPromptFolder] = useState<string | null>(null);
  const [authModalRepo, setAuthModalRepo] = useState<RepoSummary | null>(null);

  // Command Center & Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('providers');

  const handleOpenSettings = (tab: SettingsTab = 'providers') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };
  
  const [syncSelection, setSyncSelection] = useState({ path: '', remote: '', pushIndex: -1 });
  const syncRemote = syncSelection.path === selectedRepo?.path ? syncSelection.remote : selectedRepo?.sync?.pushRemote || selectedRepo?.sync?.pullRemote || selectedRepo?.remotes[0]?.name || '';
  const pushState = useRepositoryPush(selectedRepo, () => handleScan(currentPath));
  const selectSyncTarget = (remote: string, pushIndex: number) => setSyncSelection({ path: selectedRepo?.path || '', remote, pushIndex });

  // Selected file for diff
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedDiffStaged, setSelectedDiffStaged] = useState<boolean>(false);

  // Loading & AI
  const [isScanning, setIsScanning] = useState(false);
  const [aiStatus, setAIStatus] = useState<LocalAIStatus | null>(null);
  const [aiSettingsOpen, setAISettingsOpen] = useState(false);

  // Theme (Dark / Light)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('gitler_theme') as 'dark' | 'light') || 'dark';
  });

  // Keep the working area usable while respecting saved panel sizes.
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('gitler_sidebar_width');
    if (!saved || !Number.isFinite(Number(saved))) return 300;
    return Math.max(260, Math.min(650, Number(saved)));
  });

  const [copilotWidth, setCopilotWidth] = useState<number>(() => {
    const saved = localStorage.getItem('gitler_copilot_width');
    if (!saved || !Number.isFinite(Number(saved))) return 320;
    return Math.max(260, Math.min(650, Number(saved)));
  });

  const [isCopilotCollapsed, setIsCopilotCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('gitler_copilot_collapsed') === 'true';
  });

  const viewportWidth = useSyncExternalStore(subscribeToViewport, getViewportWidth);
  const [isCopilotOverlayOpen, setIsCopilotOverlayOpen] = useState(false);
  const effectiveSidebarWidth = Math.max(260, Math.min(sidebarWidth, viewportWidth - 644));
  const needsCompactCopilot = viewportWidth - effectiveSidebarWidth - copilotWidth < 600;
  const effectiveCopilotCollapsed = needsCompactCopilot ? !isCopilotOverlayOpen : isCopilotCollapsed;

  const handleToggleCopilotCollapse = () => {
    if (needsCompactCopilot) {
      setIsCopilotOverlayOpen(open => !open);
      return;
    }
    setIsCopilotCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('gitler_copilot_collapsed', String(next));
      return next;
    });
  };

  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingCopilot, setIsResizingCopilot] = useState(false);

  // Apply theme to document element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
    localStorage.setItem('gitler_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Drag Resizing: Left Sidebar
  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    const startX = e.clientX;
    const startWidth = effectiveSidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.max(260, Math.min(650, startWidth + delta));
      setSidebarWidth(nextWidth);
      localStorage.setItem('gitler_sidebar_width', String(nextWidth));
    };

    const onMouseUp = () => {
      setIsResizingSidebar(false);
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

  // Drag Resizing: Right AI Copilot
  const handleCopilotMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingCopilot(true);
    const startX = e.clientX;
    const startWidth = copilotWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.max(260, Math.min(650, startWidth - delta));
      setCopilotWidth(nextWidth);
      localStorage.setItem('gitler_copilot_width', String(nextWidth));
    };

    const onMouseUp = () => {
      setIsResizingCopilot(false);
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

  const [scanError, setScanError] = useState<string | null>(null);

  // 1. Initial Load: System folders & AI status
  useEffect(() => {
    const init = async () => {
      try {
        const [folderRes, aiRes] = await Promise.all([
          apiFetch('/api/system/folders'),
          apiFetch('/api/ai/status')
        ]);

        let targetFolder = localStorage.getItem('gitler_selected_folder');

        if (folderRes.ok) {
          const folderData = await folderRes.json();
          const availablePresets = folderData.folders || [];
          setPresets(availablePresets);

          if (!targetFolder && availablePresets.length > 0) {
            targetFolder = availablePresets[0].path;
          }
        }

        if (targetFolder) {
          setCurrentPath(targetFolder);
          handleScan(targetFolder, 3);
        }

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          setAIStatus(aiData);
        }
      } catch (e) {
        console.error('Initialization failed:', e);
      }
    };

    init();
  }, []);

  // 2. Scan repositories
  const handleScan = async (path: string, depth = 3) => {
    setIsScanning(true);
    setScanError(null);
    setCurrentPath(path);
    localStorage.setItem('gitler_selected_folder', path);

    try {
      const res = await apiFetch('/api/repos/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootDir: path, maxDepth: depth })
      });

      if (res.ok) {
        const data = await res.json();
        const repos: RepoSummary[] = data.repositories || [];
        setRepositories(repos);

        if (data.error) {
          setScanError(data.error);
          setPermissionPromptFolder(path);
        } else {
          setPermissionPromptFolder(null);
        }

        // Keep or select first repository
        if (repos.length > 0) {
          const matching = repos.find(r => r.path === selectedRepo?.path);
          if (matching) {
            setSelectedRepo(matching);
          } else {
            setSelectedRepo(repos[0]);
            setSelectedFile(null);
          }
        } else {
          setSelectedRepo(null);
          setSelectedRepoDetails(null);
        }
      }
    } catch (e: any) {
      console.error('Scan error:', e);
      setScanError(e.message || 'Failed to scan folder');
    } finally {
      setIsScanning(false);
    }
  };

  const handleBrowseFolder = async (defaultPath?: string) => {
    try {
      const targetDefault = defaultPath || currentPath;
      // 1. Electron Native macOS Open Dialog
      if ((window as any).electronAPI?.selectFolder) {
        const selected = await (window as any).electronAPI.selectFolder(targetDefault);
        if (selected) {
          setPermissionPromptFolder(null);
          handleScan(selected, 3);
        }
        return;
      }

      // 2. Web browser fallback via server
      const res = await apiFetch('/api/system/browse-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPath: targetDefault })
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.canceled && data.path) {
          setPermissionPromptFolder(null);
          handleScan(data.path, 3);
        }
      }
    } catch (err) {
      console.error('Browse folder error:', err);
    }
  };

  const handleSelectRepo = (repo: RepoSummary) => {
    setSelectedRepo(repo);
    setSelectedFile(null);
  };

  const refreshAIStatus = async () => {
    try {
      const res = await apiFetch('/api/ai/status');
      if (res.ok) setAIStatus(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const renderSidebar = () => (
    <Sidebar
      repositories={repositories}
      selectedRepo={selectedRepo}
      onSelectRepo={handleSelectRepo}
      currentPath={currentPath}
      presets={presets}
      onScan={(p, d) => handleScan(p, d)}
      onBrowseFolder={handleBrowseFolder}
      scanError={scanError}
      isScanning={isScanning}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      onOpenSettings={() => handleOpenSettings('providers')}
      width={effectiveSidebarWidth}
    />
  );

  const renderAICopilot = () => (
    selectedRepo ? (
      <AICopilotPanel
        key={'ai-' + selectedRepo.path}
        repoSummary={selectedRepo}
        syncRemote={syncRemote}
        pushState={pushState}
        details={selectedRepoDetails}
        aiStatus={aiStatus}
        repositories={repositories}
        onOpenSettings={() => handleOpenSettings('ai')}
        onCommitSuccess={() => handleScan(currentPath)}
        onOpenRemoteAuth={() => setAuthModalRepo(selectedRepo)}
        width={Math.min(copilotWidth, viewportWidth - 60)}
        isCollapsed={effectiveCopilotCollapsed}
        onToggleCollapse={handleToggleCopilotCollapse}
      />
    ) : null
  );

  const renderMainWorkspace = () => (
    selectedRepo ? (
      <MainWorkspace
        onSyncTargetChange={selectSyncTarget}
        key={selectedRepo.path}
        repoSummary={selectedRepo}
        syncRemote={syncRemote}
        pushState={pushState}
        onRefreshParent={() => handleScan(currentPath)}
        selectedFile={selectedFile}
        onSelectFile={(file, isStaged) => {
          setSelectedFile(file);
          setSelectedDiffStaged(isStaged);
        }}
        selectedDiffStaged={selectedDiffStaged}
        onDetailsUpdated={details => setSelectedRepoDetails(details)}
        onOpenRemoteAuth={() => setAuthModalRepo(selectedRepo)}
      />
    ) : scanError ? (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-muted)] p-8 text-center font-mono transition-colors">
        <div className="w-14 h-14 rounded-2xl bg-[var(--accent-violet)]/10 border border-[var(--accent-violet)]/30 flex items-center justify-center text-[var(--accent-violet)] mb-4">
          <FolderOpen className="w-7 h-7" />
        </div>
        <h3 className="font-semibold text-[var(--text-primary)] text-sm">macOS Permission Required</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-md leading-relaxed font-sans">
          {scanError}
        </p>
        <button
          onClick={() => handleBrowseFolder(currentPath)}
          className="mt-5 px-5 py-2.5 rounded-[33px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs flex items-center gap-2 transition hover:opacity-90 font-sans shadow-lg shadow-purple-950/20"
        >
          <FolderOpen className="w-4 h-4" />
          <span>Grant Access in Mac Finder</span>
        </button>
      </div>
    ) : (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-muted)] p-8 text-center font-mono transition-colors">
        <div className="w-12 h-12 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-violet)] mb-3">
          <FolderGit2 className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-[var(--text-primary)] text-xs">No Repository Selected</h3>
        <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-xs">
          Select a repository to inspect working tree changes, diffs, and commit history.
        </p>
      </div>
    )
  );

  return (
    <div className={`h-screen w-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-hidden font-sans ${theme}`}>
      {/* 3-Pane Main Layout with Smooth Drag Resizers */}
      <div className="flex-1 flex overflow-hidden">
        {renderSidebar()}

        {/* Drag Handle: Sidebar */}
        <div
          role="separator"
          tabIndex={0}
          aria-label="Repository sidebar width"
          aria-orientation="vertical"
          aria-valuemin={260}
          aria-valuemax={650}
          aria-valuenow={effectiveSidebarWidth}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              const width = Math.max(260, Math.min(650, effectiveSidebarWidth + (event.key === 'ArrowRight' ? 20 : -20)));
              setSidebarWidth(width);
              localStorage.setItem('gitler_sidebar_width', String(width));
            }
          }}
          onMouseDown={handleSidebarMouseDown}
          onDoubleClick={() => {
            setSidebarWidth(300);
            localStorage.setItem('gitler_sidebar_width', '300');
          }}
          title="Drag to resize repositories sidebar (Double-click to reset to 300px)"
          className={`w-[6px] -ml-[3px] -mr-[3px] z-20 cursor-col-resize group relative flex items-center justify-center shrink-0 select-none ${
            isResizingSidebar ? 'bg-[var(--accent-violet)]/30' : 'hover:bg-[var(--accent-violet)]/20'
          } transition-colors`}
        >
          <div
            className={`w-[1px] h-full transition-colors ${
              isResizingSidebar ? 'bg-[var(--accent-violet)]' : 'bg-[var(--border-subtle)] group-hover:bg-[var(--accent-violet)]'
            }`}
          />
        </div>

        {renderMainWorkspace()}

        {/* Drag Handle: AI Copilot */}
        {selectedRepo && !effectiveCopilotCollapsed && !needsCompactCopilot && (
          <div
            role="separator"
            tabIndex={0}
            aria-label="Copilot panel width"
            aria-orientation="vertical"
            aria-valuemin={260}
            aria-valuemax={650}
            aria-valuenow={copilotWidth}
            onKeyDown={event => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                const width = Math.max(260, Math.min(650, copilotWidth + (event.key === 'ArrowLeft' ? 20 : -20)));
                setCopilotWidth(width);
                localStorage.setItem('gitler_copilot_width', String(width));
              }
            }}
            onMouseDown={handleCopilotMouseDown}
            onDoubleClick={() => {
              setCopilotWidth(320);
              localStorage.setItem('gitler_copilot_width', '320');
            }}
            title="Drag to resize AI Copilot panel (Double-click to reset)"
            className={`w-[6px] -ml-[3px] -mr-[3px] z-20 cursor-col-resize group relative flex items-center justify-center shrink-0 select-none ${
              isResizingCopilot ? 'bg-[var(--accent-violet)]/30' : 'hover:bg-[var(--accent-violet)]/20'
            } transition-colors`}
          >
            <div
              className={`w-[1px] h-full transition-colors ${
                isResizingCopilot ? 'bg-[var(--accent-violet)]' : 'bg-[var(--border-subtle)] group-hover:bg-[var(--accent-violet)]'
              }`}
            />
          </div>
        )}

        {needsCompactCopilot && isCopilotOverlayOpen ? (
          <div className="fixed right-0 top-0 bottom-7 z-40 bg-[var(--bg-canvas)] shadow-2xl border-l border-[var(--border-interactive)]">
            {renderAICopilot()}
          </div>
        ) : renderAICopilot()}
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        aiStatus={aiStatus}
        onOpenAISettings={() => handleOpenSettings('ai')}
        selectedRepo={selectedRepo}
        repoCount={repositories.length}
        currentPath={currentPath}
      />

      {/* Command Center & Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          initialTab={settingsTab}
          aiStatus={aiStatus}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onRefreshAIStatus={refreshAIStatus}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* Remote & Authentication Modal */}
      {authModalRepo && (
        <RemoteAuthModal
          repo={authModalRepo}
          onClose={() => setAuthModalRepo(null)}
          onUpdated={() => {
            handleScan(currentPath);
          }}
        />
      )}

      {/* macOS Folder Permission Modal */}
      {permissionPromptFolder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-violet)]/10 border border-[var(--accent-violet)]/20 flex items-center justify-center text-[var(--accent-violet)] shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">macOS Folder Permission</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Access to {permissionPromptFolder.split('/').pop() || 'folder'}
                </p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-sans">
              macOS protects folders such as <strong>Desktop</strong> and <strong>Documents</strong>. To let Gitler scan and display your repositories, please grant access by selecting this folder in the native Mac Finder dialog.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPermissionPromptFolder(null)}
                className="px-4 py-2 rounded-[33px] border border-[var(--border-interactive)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleBrowseFolder(permissionPromptFolder)}
                className="px-4 py-2 rounded-[33px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-semibold flex items-center gap-1.5 transition hover:opacity-90 shadow-sm"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Grant Access in Finder</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
