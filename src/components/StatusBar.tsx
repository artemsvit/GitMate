import React from 'react';
import { Cpu, GitBranch, Folder, Sparkles } from 'lucide-react';
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
    <footer className="h-7 bg-[#000000] border-t border-[#1e1e1d] px-3.5 flex items-center justify-between text-[11px] text-[#868684] font-mono select-none shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenAISettings}
          className="flex items-center gap-1.5 hover:text-[#faf9f6] transition"
          title="Configure AI model"
        >
          {aiStatus?.available ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#cbb0f7]" />
              <Cpu className="w-3 h-3 text-[#cbb0f7]" />
              <span className="text-[#faf9f6] font-medium">
                {aiStatus.provider}: {aiStatus.activeModel}
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#868684]" />
              <Sparkles className="w-3 h-3 text-[#868684]" />
              <span className="text-[#868684]">Heuristics (Offline)</span>
            </>
          )}
        </button>

        <span className="text-[#333333]">|</span>

        <div className="flex items-center gap-1 text-[#666469]">
          <Folder className="w-3 h-3" />
          <span className="truncate max-w-xs">{currentPath}</span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {selectedRepo && (
          <div className="flex items-center gap-1.5 text-[#b4b4b2]">
            <GitBranch className="w-3 h-3 text-[#cbb0f7]" />
            <span className="font-semibold text-[#faf9f6]">{selectedRepo.name}</span>
            <span className="text-[#666469]">({selectedRepo.currentBranch})</span>
          </div>
        )}

        <span className="text-[#333333]">|</span>

        <span className="text-[#666469]">{repoCount} repositories</span>
      </div>
    </footer>
  );
};
