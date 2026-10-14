import React from 'react';
import { GitBranch, Folder } from 'lucide-react';
import { RepoSummary } from '../types';

interface StatusBarProps {
  selectedRepo: RepoSummary | null;
  repoCount: number;
  currentPath: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  selectedRepo,
  repoCount,
  currentPath
}) => {
  return (
    <footer className="h-7 bg-[var(--bg-canvas)] border-t border-[var(--border-subtle)] px-3.5 flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono select-none shrink-0 transition-colors">
      {/* Left */}
      <div className="flex items-center gap-3">
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

      </div>
    </footer>
  );
};
