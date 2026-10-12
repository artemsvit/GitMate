import React, { useState } from 'react';
import {
  Sparkles,
  GitCommit,
  Send,
  Cpu,
  CheckCircle2,
  AlertCircle,
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

  // Conventional type chips
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
    <aside className="w-80 h-full flex flex-col bg-[#000000] border-l border-[#1e1e1d] p-4 select-none shrink-0 justify-between">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1e1e1d]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#121212] border border-[#333333] flex items-center justify-center text-[#cbb0f7]">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-xs text-[#faf9f6] tracking-tight">AI Copilot</span>
          </div>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[50px] border border-[#333333] text-[10px] font-mono text-[#b4b4b2] hover:text-[#faf9f6] transition"
            title="Configure AI model"
          >
            <Cpu className="w-3 h-3 text-[#cbb0f7]" />
            <span className="truncate max-w-[90px]">{aiStatus?.activeModel || 'Settings'}</span>
          </button>
        </div>

        {/* Change Stats */}
        <div className="p-3 rounded-2xl bg-[#121212] border border-[#1e1e1d] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#868684]">
            <FileCode2 className="w-3.5 h-3.5 text-[#cbb0f7]" />
            <span className="text-[11px] font-medium">Working Tree</span>
          </div>
          <span className="font-mono text-xs text-[#faf9f6]">
            {totalChanges} changed files
          </span>
        </div>

        {/* Generate Button (Paper #ffffff filled pill button) */}
        <button
          onClick={handleGenerateCommit}
          disabled={isGenerating || totalChanges === 0}
          className="w-full py-2.5 px-4 rounded-[33px] bg-[#ffffff] hover:bg-[#faf9f6] text-[#080808] font-semibold text-xs transition flex items-center justify-center gap-2 disabled:opacity-30 cursor-pointer"
        >
          {isGenerating ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-[#080808]/30 border-t-[#080808] rounded-full animate-spin" />
              <span>Analyzing diff...</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5 text-[#080808]" />
              <span>Generate with Local AI</span>
            </>
          )}
        </button>

        {/* AI source tag if generated */}
        {aiResult && (
          <div className="flex items-center justify-between text-[10px] font-mono text-[#868684] px-1">
            <span>Model: {aiResult.model}</span>
            <span className="text-[#cbb0f7] font-semibold">{aiResult.provider}</span>
          </div>
        )}

        {/* Conventional Type Tags */}
        <div>
          <div className="flex items-center gap-1 mb-2 text-[9px] uppercase font-bold text-[#868684] tracking-widest">
            <Tag className="w-2.5 h-2.5" /> Types
          </div>
          <div className="flex gap-1 flex-wrap">
            {typeChips.map(t => (
              <button
                key={t}
                onClick={() => handleApplyType(t)}
                className="px-2.5 py-0.5 rounded-[50px] border border-[#333333] text-[10px] font-mono text-[#868684] hover:text-[#faf9f6] hover:border-[#868684] transition"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Commit Message Box */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-[#faf9f6] flex items-center gap-1">
              <GitCommit className="w-3.5 h-3.5 text-[#868684]" /> Message
            </span>
            <span className={`text-[10px] font-mono ${isLineTooLong ? 'text-[#f28b82]' : 'text-[#868684]'}`}>
              {firstLine.length}/72
            </span>
          </div>
          <textarea
            value={commitMessage}
            onChange={e => setCommitMessage(e.target.value)}
            placeholder="feat(ui): update to warp design tokens..."
            rows={5}
            className="w-full bg-[#121212] border border-[#333333] focus:border-[#cbb0f7] rounded-xl p-3 text-xs text-[#faf9f6] placeholder-[#666469] font-mono focus:outline-none transition resize-none leading-relaxed"
          />
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-[#121212] border-[#52b774]/40 text-[#86e19b]'
                : 'bg-[#121212] border-[#d9534f]/40 text-[#f28b82]'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-[#52b774] shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-[#f28b82] shrink-0" />
            )}
            <span className="truncate text-[11px]">{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-3 border-t border-[#1e1e1d] space-y-2">
        <button
          onClick={() => handleCommit(false)}
          disabled={isCommitting || !commitMessage.trim()}
          className="w-full py-2.5 rounded-[33px] border border-[#333333] hover:border-[#868684] bg-transparent text-[#faf9f6] text-xs font-medium transition disabled:opacity-30"
        >
          {isCommitting ? 'Committing...' : 'Commit Changes'}
        </button>

        <button
          onClick={() => handleCommit(true)}
          disabled={isCommitting || !commitMessage.trim()}
          className="w-full py-2.5 rounded-[33px] bg-[#faf9f6] hover:bg-[#ffffff] text-[#080808] font-semibold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-30"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Commit & Push</span>
        </button>
      </div>
    </aside>
  );
};
