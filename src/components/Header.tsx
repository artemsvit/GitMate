import React from 'react';
import { GitBranch, Sparkles, Settings, RefreshCw, Cpu } from 'lucide-react';
import { LocalAIStatus } from '../types';

interface HeaderProps {
  aiStatus: LocalAIStatus | null;
  onOpenAISettings: () => void;
  onRefreshAll: () => void;
  isScanning: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  aiStatus,
  onOpenAISettings,
  onRefreshAll,
  isScanning
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-amber-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <GitBranch className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Git Mate</h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">Visual Git Workspace & Local AI Engine</p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* AI Status Badge */}
          <button
            onClick={onOpenAISettings}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              aiStatus?.available
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
            }`}
          >
            {aiStatus?.available ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <Cpu className="w-3.5 h-3.5" />
                <span>
                  {aiStatus.provider === 'embedded' ? (
                    <span className="font-semibold">Git Mate Commit Suggestions</span>
                  ) : (
                    <>
                      {aiStatus.provider === 'ollama' ? 'Ollama' : 'LM Studio'}:{' '}
                      <span className="font-semibold">{aiStatus.activeModel || 'Active'}</span>
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <Sparkles className="w-3.5 h-3.5" />
                <span>Local AI: Heuristic Fallback</span>
              </>
            )}
            <Settings className="w-3 h-3 ml-1 text-slate-400" />
          </button>

          {/* Refresh button */}
          <button
            onClick={onRefreshAll}
            disabled={isScanning}
            title="Refresh current folder scan"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
