import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MainWorkspace } from './components/MainWorkspace';
import { AICopilotPanel } from './components/AICopilotPanel';
import { StatusBar } from './components/StatusBar';
import { AISettingsModal } from './components/AISettingsModal';
import { RepoSummary, RepoDetails, LocalAIStatus } from './types';
import { FolderGit2 } from 'lucide-react';

export function App() {
  const [currentPath, setCurrentPath] = useState('');
  const [presets, setPresets] = useState<{ name: string; path: string }[]>([]);
  const [repositories, setRepositories] = useState<RepoSummary[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<RepoSummary | null>(null);
  const [selectedRepoDetails, setSelectedRepoDetails] = useState<RepoDetails | null>(null);
  
  // Selected file for diff
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedDiffStaged, setSelectedDiffStaged] = useState<boolean>(false);

  // Loading & AI
  const [isScanning, setIsScanning] = useState(false);
  const [aiStatus, setAIStatus] = useState<LocalAIStatus | null>(null);
  const [aiSettingsOpen, setAISettingsOpen] = useState(false);

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
            handleScan(defaultFolder, 3);
          }
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
    setCurrentPath(path);

    try {
      const res = await fetch('/api/repos/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootDir: path, maxDepth: depth })
      });

      if (res.ok) {
        const data = await res.json();
        const repos: RepoSummary[] = data.repositories || [];
        setRepositories(repos);

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
    } catch (e) {
      console.error('Scan error:', e);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectRepo = (repo: RepoSummary) => {
    setSelectedRepo(repo);
    setSelectedFile(null);
  };

  const refreshAIStatus = async () => {
    try {
      const res = await fetch('/api/ai/status');
      if (res.ok) setAIStatus(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 3-Pane Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Repositories Sidebar */}
        <Sidebar
          repositories={repositories}
          selectedRepo={selectedRepo}
          onSelectRepo={handleSelectRepo}
          currentPath={currentPath}
          presets={presets}
          onScan={(p, d) => handleScan(p, d)}
          isScanning={isScanning}
        />

        {/* Center: Main Workspace (Staging, File List, and Diff Viewer) */}
        {selectedRepo ? (
          <MainWorkspace
            key={selectedRepo.path}
            repoSummary={selectedRepo}
            onRefreshParent={() => handleScan(currentPath)}
            selectedFile={selectedFile}
            onSelectFile={(file, isStaged) => {
              setSelectedFile(file);
              setSelectedDiffStaged(isStaged);
            }}
            selectedDiffStaged={selectedDiffStaged}
            onDetailsUpdated={details => setSelectedRepoDetails(details)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-slate-500 p-8 text-center">
            <FolderGit2 className="w-12 h-12 text-slate-700 mb-3" />
            <h3 className="font-semibold text-slate-300 text-sm">No Repository Selected</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Choose a repository from the left panel to inspect working tree changes, diffs, and history.
            </p>
          </div>
        )}

        {/* Right: AI Commit Copilot Panel */}
        {selectedRepo && (
          <AICopilotPanel
            key={'ai-' + selectedRepo.path}
            repoSummary={selectedRepo}
            details={selectedRepoDetails}
            aiStatus={aiStatus}
            onOpenSettings={() => setAISettingsOpen(true)}
            onCommitSuccess={() => handleScan(currentPath)}
          />
        )}
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        aiStatus={aiStatus}
        onOpenAISettings={() => setAISettingsOpen(true)}
        selectedRepo={selectedRepo}
        repoCount={repositories.length}
        currentPath={currentPath}
      />

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
