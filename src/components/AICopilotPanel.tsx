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
  width?: number;
}

export const AICopilotPanel: React.FC<AICopilotPanelProps> = ({
  repoSummary,
  details,
  aiStatus,
  onOpenSettings,
  onCommitSuccess,
  width = 340
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
    <aside
      style={{ width }}
      className="h-full flex flex-col bg-[var(--bg-canvas)] p-4 select-none shrink-0 justify-between transition-colors"
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[var(--bg-surface)] border border-[var(--border-interactive)] flex items-center justify-center text-[var(--accent-violet)]">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-xs text-[var(--text-primary)] tracking-tight">AI Copilot</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[50px] border border-[var(--border-interactive)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              title="Configure AI model"
            >
              <Cpu className="w-3 h-3 text-[var(--accent-violet)]" />
              <span className="truncate max-w-[80px]">{aiStatus?.activeModel || 'Settings'}</span>
            </button>
          </div>
        </div>

        {/* Change Stats */}
        <div className="p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <FileCode2 className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
            <span className="text-[11px] font-medium">Working Tree</span>
          </div>
          <span className="font-mono text-xs text-[var(--text-primary)]">
            {totalChanges} changed files
          </span>
        </div>

        {/* Generate Button (Paper filled pill button) */}
        <button
          onClick={handleGenerateCommit}
          disabled={isGenerating || totalChanges === 0}
          className="w-full py-2.5 px-4 rounded-[33px] bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] font-semibold text-xs transition flex items-center justify-center gap-2 disabled:opacity-30 cursor-pointer"
        >
          {isGenerating ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              <span>Analyzing diff...</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              <span>Generate with Local AI</span>
            </>
          )}
        </button>

        {/* AI source tag if generated */}
        {aiResult && (
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] px-1">
            <span>Model: {aiResult.model}</span>
            <span className="text-[var(--accent-violet)] font-semibold">{aiResult.provider}</span>
          </div>
        )}

        {/* Conventional Type Tags */}
        <div>
          <div className="flex items-center gap-1 mb-2 text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-widest">
            <Tag className="w-2.5 h-2.5" /> Types
          </div>
          <div className="flex gap-1 flex-wrap">
            {typeChips.map(t => (
              <button
                key={t}
                onClick={() => handleApplyType(t)}
                className="px-2.5 py-0.5 rounded-[50px] border border-[var(--border-interactive)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Commit Message Box */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-[var(--text-primary)] flex items-center gap-1">
              <GitCommit className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Message
            </span>
            <span className={`text-[10px] font-mono ${isLineTooLong ? 'text-amber-500' : 'text-[var(--text-muted)]'}`}>
              {firstLine.length}/72
            </span>
          </div>
          <textarea
            value={commitMessage}
            onChange={e => setCommitMessage(e.target.value)}
            placeholder="feat(ui): update to warp design tokens..."
            rows={5}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-interactive)] focus:border-[var(--accent-violet)] rounded-xl p-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-dim)] font-mono focus:outline-none transition resize-none leading-relaxed"
          />
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-[var(--bg-surface)] border-emerald-500/40 text-emerald-500'
                : 'bg-[var(--bg-surface)] border-rose-500/40 text-rose-500'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            )}
            <span className="truncate text-[11px]">{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
        <button
          onClick={() => handleCommit(false)}
          disabled={isCommitting || !commitMessage.trim()}
          className="w-full py-2.5 rounded-[33px] border border-[var(--border-interactive)] hover:border-[var(--text-muted)] bg-transparent text-[var(--text-primary)] text-xs font-medium transition disabled:opacity-30"
        >
          {isCommitting ? 'Committing...' : 'Commit Changes'}
        </button>

        <button
          onClick={() => handleCommit(true)}
          disabled={isCommitting || !commitMessage.trim()}
          className="w-full py-2.5 rounded-[33px] bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] font-semibold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-30"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Commit & Push</span>
        </button>
      </div>
    </aside>
  );
};
