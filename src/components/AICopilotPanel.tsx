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
  Tag,
  PanelRightClose,
  PanelRightOpen,
  Globe
} from 'lucide-react';
import { RepoDetails, RepoSummary, LocalAIStatus, AICommitResult } from '../types';

interface AICopilotPanelProps {
  repoSummary: RepoSummary;
  details: RepoDetails | null;
  aiStatus: LocalAIStatus | null;
  onOpenSettings: () => void;
  onCommitSuccess: () => void;
  onOpenRemoteAuth?: () => void;
  width?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const AICopilotPanel: React.FC<AICopilotPanelProps> = ({
  repoSummary,
  details,
  aiStatus,
  onOpenSettings,
  onCommitSuccess,
  onOpenRemoteAuth,
  width = 380,
  isCollapsed = false,
  onToggleCollapse
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
      const savedMode = localStorage.getItem('gitler_ai_mode') || 'embedded';
      const targetProvider = savedMode === 'external' ? (aiStatus?.externalProvider || 'ollama') : 'embedded';
      const targetModel = savedMode === 'external' ? aiStatus?.externalActiveModel : 'Gitler Embedded';

      const res = await fetch('/api/ai/generate-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: repoSummary.path,
          provider: targetProvider,
          model: targetModel
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
          try {
            const pushRes = await fetch('/api/repos/push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: repoSummary.path })
            });
            const pushData = await pushRes.json();
            if (pushRes.ok) {
              setStatusMessage({
                text: `Committed & Pushed to remote! (${data.commitHash.slice(0, 7)})`,
                type: 'success'
              });
            } else {
              setStatusMessage({
                text: `Committed locally (${data.commitHash.slice(0, 7)}), but Push failed: ${pushData.error || 'Push error'}`,
                type: 'error'
              });
            }
          } catch (pushErr: any) {
            setStatusMessage({
              text: `Committed locally (${data.commitHash.slice(0, 7)}), but Push failed: ${pushErr.message}`,
              type: 'error'
            });
          }
        } else {
          setStatusMessage({ text: `Committed: ${data.commitHash.slice(0, 7)}`, type: 'success' });
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

  if (isCollapsed) {
    return (
      <aside
        style={{ width: 44 }}
        className="h-full flex flex-col items-center justify-between bg-[var(--bg-canvas)] border-l border-[var(--border-subtle)] py-3 px-1 select-none shrink-0 transition-colors"
      >
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onToggleCollapse}
            className="w-7 h-7 rounded-lg border border-[var(--border-interactive)] hover:border-[var(--accent-violet)] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition flex items-center justify-center cursor-pointer shadow-sm"
            title="Expand AI Copilot panel"
          >
            <PanelRightOpen className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleCollapse}
            className="flex flex-col items-center gap-2 group cursor-pointer pt-3"
            title="Expand AI Copilot panel"
          >
            <div className="w-6 h-6 rounded-md bg-[var(--bg-surface)] border border-[var(--border-interactive)] flex items-center justify-center text-[var(--accent-violet)] group-hover:scale-105 transition">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span
              className="text-[10px] font-mono tracking-widest uppercase text-[var(--text-dim)] group-hover:text-[var(--text-primary)] transition"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              AI Copilot
            </span>
          </button>
        </div>

        <button
          onClick={onOpenSettings}
          className="w-7 h-7 rounded-lg hover:bg-[var(--bg-surface)] text-[var(--text-dim)] hover:text-[var(--text-primary)] transition flex items-center justify-center cursor-pointer"
          title="AI Settings"
        >
          <Cpu className="w-3.5 h-3.5" />
        </button>
      </aside>
    );
  }

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
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg border border-[var(--border-interactive)] hover:border-[var(--accent-violet)] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition flex items-center justify-center cursor-pointer"
              title="Collapse AI Copilot panel"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
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
          {aiResult && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--accent-violet)] font-mono">
              <Zap className="w-3 h-3" />
              <span>Generated with {aiResult.provider}</span>
            </div>
          )}
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl border text-xs font-mono space-y-2 ${
              statusMessage.type === 'success'
                ? 'bg-[var(--bg-surface)] border-emerald-500/40 text-emerald-500'
                : 'bg-[var(--bg-surface)] border-rose-500/40 text-rose-500'
            }`}
          >
            <div className="flex items-start gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
              )}
              <div className="text-[11px] leading-relaxed break-words font-mono flex-1">
                {statusMessage.text}
              </div>
            </div>

            {/* Quick action button for Push / Authentication failures */}
            {statusMessage.type === 'error' &&
              onOpenRemoteAuth &&
              (statusMessage.text.includes('Push failed') ||
                statusMessage.text.toLowerCase().includes('auth') ||
                statusMessage.text.toLowerCase().includes('remote') ||
                statusMessage.text.toLowerCase().includes('permission') ||
                statusMessage.text.toLowerCase().includes('ssh') ||
                statusMessage.text.toLowerCase().includes('token')) && (
                <div className="pt-1 flex items-center justify-end">
                  <button
                    onClick={onOpenRemoteAuth}
                    className="px-2.5 py-1 rounded-[33px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-sans font-semibold flex items-center gap-1.5 transition"
                  >
                    <Globe className="w-3 h-3" />
                    <span>Configure Remote / Auth</span>
                  </button>
                </div>
              )}
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
