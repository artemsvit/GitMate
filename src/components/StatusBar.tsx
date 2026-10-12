import React from 'react';
import { Cpu, GitBranch, Folder, Sparkles, CheckCircle2 } from 'lucide-react';
import { LocalAIStatus, RepoSummary } from '../types';

interface StatusBarProps {
  aiStatus: LocalAIStatus | null;
  onOpenAISettings: () => void;
  selectedRepo: RepoSummary | null;
  repoCount: number;
  currentPath: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  aiStatus,
  onOpenAISettings,
  selectedRepo,
  repoCount,
  currentPath
}) => {
  return (
    <footer className="h-7 bg-slate-950 border-t border-slate-800/80 px-3 flex items-center justify-between text-[11px] text-slate-400 font-mono select-none shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenAISettings}
          className="flex items-center gap-1.5 hover:text-slate-200 transition"
          title="Click to configure AI"
        >
          {aiStatus?.available ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-medium">
                {aiStatus.provider}: {aiStatus.activeModel}
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span className="text-amber-400">Heuristics (AI Offline)</span>
            </>
          )}
        </button>

        <span className="text-slate-700">|</span>

        <div className="flex items-center gap-1 text-slate-500">
          <Folder className="w-3 h-3" />
          <span className="truncate max-w-xs">{currentPath}</span>
        </div>
      </div>

      {/* Center / Right */}
      <div className="flex items-center gap-3">
        {selectedRepo && (
          <div className="flex items-center gap-1.5 text-slate-300">
            <GitBranch className="w-3 h-3 text-indigo-400" />
            <span className="font-semibold text-white">{selectedRepo.name}</span>
            <span className="text-slate-500">({selectedRepo.currentBranch})</span>
          </div>
        )}

        <span className="text-slate-700">|</span>

        <span className="text-slate-500">{repoCount} repositories</span>
      </div>
    </footer>
  );
};
