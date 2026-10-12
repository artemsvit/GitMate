import React from 'react';
import { Cpu, GitBranch, Folder, Sparkles, ArrowLeftRight } from 'lucide-react';
import { LocalAIStatus, RepoSummary } from '../types';

interface StatusBarProps {
  aiStatus: LocalAIStatus | null;
  onOpenAISettings: () => void;
  selectedRepo: RepoSummary | null;
  repoCount: number;
  currentPath: string;
  layoutFlipped: boolean;
  onToggleLayout: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  aiStatus,
  onOpenAISettings,
  selectedRepo,
  repoCount,
  currentPath,
  layoutFlipped,
  onToggleLayout
}) => {
  return (
    <footer className="h-7 bg-[var(--bg-canvas)] border-t border-[var(--border-subtle)] px-3.5 flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono select-none shrink-0 transition-colors">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenAISettings}
          className="flex items-center gap-1.5 hover:text-[var(--text-primary)] transition"
          title="Configure AI model"
        >
          {aiStatus?.available ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-violet)]" />
              <Cpu className="w-3 h-3 text-[var(--accent-violet)]" />
              <span className="text-[var(--text-primary)] font-medium">
                {aiStatus.provider}: {aiStatus.activeModel}
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
              <Sparkles className="w-3 h-3 text-[var(--text-muted)]" />
              <span className="text-[var(--text-muted)]">Heuristics (Offline)</span>
            </>
          )}
        </button>

        <span className="text-[var(--border-interactive)]">|</span>

        <div className="flex items-center gap-1 text-[var(--text-dim)]">
          <Folder className="w-3 h-3" />
          <span className="truncate max-w-xs">{currentPath}</span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {selectedRepo && (
          <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <GitBranch className="w-3 h-3 text-[var(--accent-violet)]" />
            <span className="font-semibold text-[var(--text-primary)]">{selectedRepo.name}</span>
            <span className="text-[var(--text-dim)]">({selectedRepo.currentBranch})</span>
          </div>
        )}

        <span className="text-[var(--border-interactive)]">|</span>

        <span className="text-[var(--text-dim)]">{repoCount} repositories</span>

        <span className="text-[var(--border-interactive)]">|</span>

        <button
          onClick={onToggleLayout}
          title={layoutFlipped ? 'Layout: Copilot on Left, Repos on Right' : 'Layout: Repos on Left, Copilot on Right'}
          className="flex items-center gap-1 hover:text-[var(--text-primary)] transition"
        >
          <ArrowLeftRight className="w-3 h-3" />
          <span>{layoutFlipped ? 'Flipped' : 'Default'}</span>
        </button>
      </div>
    </footer>
  );
};
