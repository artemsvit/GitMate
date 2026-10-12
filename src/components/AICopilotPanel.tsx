import React, { useState } from 'react';
import {
  Sparkles,
  GitCommit,
  Send,
  Cpu,
  Settings,
  AlertCircle,
  CheckCircle2,
  FileCode2,
  Zap,
  Tag
} from 'lucide-react';
import { RepoDetails, RepoSummary, LocalAIStatus, AICommitResult } from '../types';

interface AICopilotPanelProps {
  repoSummary: RepoSummary;
  details: RepoDetails | null;
  aiStatus: LocalAIStatus | null;
  onOpenSettings: () => void;
  onCommitSuccess: () => void;
}

export const AICopilotPanel: React.FC<AICopilotPanelProps> = ({
  repoSummary,
  details,
  aiStatus,
  onOpenSettings,
  onCommitSuccess
}) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [aiResult, setAiResult] = useState<AICommitResult | null>(null);

  const totalChanges = (details?.stagedCount || 0) + (details?.unstagedCount || 0);

  // Quick type chips
  const typeChips = ['feat', 'fix', 'refactor', 'chore', 'docs', 'style'];

  const handleApplyType = (type: string) => {
    if (!commitMessage) {
      setCommitMessage(`${type}: `);
    } else if (commitMessage.includes(':')) {
      const parts = commitMessage.split(':');
      setCommitMessage(`${type}${parts.slice(1).join(':')}`);
    } else {
      setCommitMessage(`${type}: ${commitMessage}`);
    }
  };

  const handleGenerateCommit = async () => {
    setIsGenerating(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/ai/generate-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: repoSummary.path,
          provider: aiStatus?.provider,
          model: aiStatus?.activeModel
        })
      });

      if (res.ok) {
        const data: AICommitResult = await res.json();
        setCommitMessage(data.message);
        setAiResult(data);
      } else {
        setStatusMessage({ text: 'Generation failed', type: 'error' });
      }
    } catch (e: any) {
      setStatusMessage({ text: e.message || 'Error generating', type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCommit = async (andPush = false) => {
    if (!commitMessage.trim()) {
      setStatusMessage({ text: 'Please enter a commit message', type: 'error' });
      return;
    }

    setIsCommitting(true);
    setStatusMessage(null);
    try {
      // Auto stage all if nothing staged
      if ((details?.stagedCount || 0) === 0) {
        await fetch('/api/repos/stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: repoSummary.path, files: ['.'] })
        });
      }

      const res = await fetch('/api/repos/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoSummary.path, message: commitMessage.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        setCommitMessage('');
        setAiResult(null);

        if (andPush) {
          await fetch('/api/repos/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: repoSummary.path })
          });
          setStatusMessage({ text: `Committed & Pushed! (${data.commitHash})`, type: 'success' });
        } else {
          setStatusMessage({ text: `Committed: ${data.commitHash}`, type: 'success' });
        }

        onCommitSuccess();
      } else {
        const err = await res.json();
        setStatusMessage({ text: err.error || 'Commit failed', type: 'error' });
      }
    } catch (e: any) {
      setStatusMessage({ text: e.message || 'Error committing', type: 'error' });
    } finally {
      setIsCommitting(false);
    }
  };

  const firstLine = commitMessage.split('\n')[0] || '';
  const isLineTooLong = firstLine.length > 72;

  return (
    <aside className="w-80 h-full flex flex-col bg-slate-950 border-l border-slate-800/80 p-4 select-none shrink-0 justify-between">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-xs text-white">AI Commit Copilot</span>
          </div>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-slate-200 transition"
            title="Configure AI model"
          >
            <Cpu className="w-3 h-3 text-indigo-400" />
            <span className="truncate max-w-[90px]">{aiStatus?.activeModel || 'Settings'}</span>
          </button>
        </div>

        {/* Change Stats */}
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300">
            <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Working Tree</span>
          </div>
          <span className="font-mono font-semibold text-slate-200">
            {totalChanges} changed files
          </span>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerateCommit}
          disabled={isGenerating || totalChanges === 0}
          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
        >
          {isGenerating ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span>Analyzing diff with {aiStatus?.activeModel || 'AI'}...</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Generate Commit Message</span>
            </>
          )}
        </button>

        {/* AI source tag if generated */}
        {aiResult && (
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
            <span>Model: {aiResult.model}</span>
            <span className="text-emerald-400 font-semibold">{aiResult.provider}</span>
          </div>
        )}

        {/* Conventional Type Quick Chips */}
        <div>
          <div className="flex items-center gap-1 mb-1.5 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            <Tag className="w-2.5 h-2.5" /> Conventional Types
          </div>
          <div className="flex gap-1 flex-wrap">
            {typeChips.map(t => (
              <button
                key={t}
                onClick={() => handleApplyType(t)}
                className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-[10px] font-mono text-slate-400 hover:text-indigo-300 border border-slate-800 transition"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Commit Message Box */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
              <GitCommit className="w-3.5 h-3.5 text-slate-500" /> Message
            </span>
            <span className={`text-[10px] font-mono ${isLineTooLong ? 'text-amber-400' : 'text-slate-500'}`}>
              {firstLine.length}/72 chars
            </span>
          </div>
          <textarea
            value={commitMessage}
            onChange={e => setCommitMessage(e.target.value)}
            placeholder="feat(ui): implement modern 3-pane layout..."
            rows={5}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500 transition resize-none leading-relaxed"
          />
        </div>

        {/* Status Toast Notification */}
        {statusMessage && (
          <div
            className={`p-2.5 rounded-xl border text-xs font-mono flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            <span className="truncate">{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-3 border-t border-slate-800/80 space-y-2">
        <button
          onClick={() => handleCommit(false)}
          disabled={isCommitting || !commitMessage.trim()}
          className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 text-xs font-semibold transition disabled:opacity-40"
        >
          {isCommitting ? 'Committing...' : 'Commit Changes'}
        </button>

        <button
          onClick={() => handleCommit(true)}
          disabled={isCommitting || !commitMessage.trim()}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Commit & Push ⚡</span>
        </button>
      </div>
    </aside>
  );
};
