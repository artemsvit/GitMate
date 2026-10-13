import { cn } from '../cn';
import { currentCommitNotice, type CommitNotice } from '../pushStatus';
import { useRepositoryPush, destinationKey } from '../useRepositoryPush';
import { PushResults } from './PushResults';
import { Dropdown } from './Dropdown';
import { apiFetch } from '../api';
import React, { useState, useRef, useEffect } from 'react';
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
import { CopilotChat } from './CopilotChat';
import { RepoDetails, RepoSummary, LocalAIStatus, AICommitResult } from '../types';

interface AICopilotPanelProps {
  syncRemote: string;
  pushState: ReturnType<typeof useRepositoryPush>;
  repoSummary: RepoSummary;
  repositories: RepoSummary[];
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
  repoSummary, repositories,
  syncRemote, pushState,
  details,
  aiStatus,
  onOpenSettings,
  onCommitSuccess,
  onOpenRemoteAuth,
  width = 380,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const [activeTab, setActiveTab] = useState<'commit' | 'chat'>('commit');
  const [commitMessage, setCommitMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<CommitNotice | null>(null);
  const [aiResult, setAiResult] = useState<AICommitResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(100, textarea.scrollHeight)}px`;
  }, [commitMessage]);

  const hasStagedChanges = (details?.stagedCount || 0) > 0;
  const totalChanges = details?.files.length || 0;

  // Conventional type chips
  const typeChips = ['feat', 'fix', 'refactor', 'chore', 'docs', 'style'];

  const handleApplyType = (type: string) => {
    if (!commitMessage) {
      setCommitMessage(`${type}: `);
    } else if (commitMessage.includes(':')) {
      const parts = commitMessage.split(':');
      setCommitMessage(`${type}: ${parts.slice(1).join(':').trim()}`);
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

      const res = await apiFetch('/api/ai/generate-commit', {
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
      if (!hasStagedChanges) {
        setStatusMessage({ text: 'Stage the changes you want to commit first.', type: 'error' });
        return;
      }

      const res = await apiFetch('/api/repos/commit', {
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
            const pushData = await pushState.push(data.commitHash);
            setStatusMessage({ pushCommit: data.commitHash, text: pushData.success ? `Verified ${data.commitHash.slice(0, 7)} at every selected destination.` : `Committed locally (${data.commitHash.slice(0, 7)}). Some destinations failed; review the results.`, type: pushData.success ? 'success' : 'error' });
          } catch (pushErr: any) {
            setStatusMessage({
              text: `Committed locally (${data.commitHash.slice(0, 7)}), but Push failed: ${pushErr.message}`,
              type: 'error'
            });
          }
        } else {
          setStatusMessage({ text: `Committed locally: ${data.commitHash.slice(0, 7)}. Push to publish it.`, type: 'success' });
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

  const displayStatus = currentCommitNotice(statusMessage, pushState.report);
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
      className="h-full min-h-0 flex flex-col bg-[var(--bg-canvas)] border-l border-[var(--border-subtle)] select-none shrink-0 overflow-hidden"
    >
        {/* Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
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
              aria-label="Collapse AI Copilot panel" title="Collapse AI Copilot panel"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div role="tablist" aria-label="Copilot mode" className="h-10 px-4 flex gap-6 border-b border-[var(--border-subtle)] shrink-0">
          {(['commit', 'chat'] as const).map(tab => <button key={tab} role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={cn('h-full text-xs font-medium border-b-2 flex items-center gap-2', activeTab === tab ? 'border-[var(--accent-violet)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)]')}>{tab === 'commit' ? <GitCommit className="size-3.5" /> : <Sparkles className="size-3.5" />}{tab === 'commit' ? 'Commit' : 'Chat'}</button>)}
        </div>
        {activeTab === 'chat' ? <CopilotChat key={repoSummary.path} repo={repoSummary} repositories={repositories} /> : <div role="tabpanel" aria-label="Commit" className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Generate Button (Paper filled pill button) */}
        <button
          onClick={handleGenerateCommit}
          disabled={isGenerating || !hasStagedChanges}
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
              <span>Generate Commit Message</span>
            </>
          )}
        </button>

        {!hasStagedChanges && <p className="text-xs text-[var(--text-muted)]">Stage changes before generating a message or committing.</p>}

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
            ref={textareaRef}
            aria-label="Commit message"
            value={commitMessage}
            onChange={e => {
              setCommitMessage(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.max(100, e.target.scrollHeight)}px`;
            }}
            placeholder="feat(ui): update to warp design tokens..."
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-interactive)] focus:border-[var(--accent-violet)] rounded-xl p-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-dim)] font-mono focus:outline-none transition resize-none leading-relaxed overflow-hidden"
          />
          {aiResult && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--accent-violet)] font-mono">
              <Zap className="w-3 h-3" />
              <span>Generated with {aiResult.provider}</span>
            </div>
          )}
        </div>

        {/* Status Toast */}
        {displayStatus && (
          <div
            className={`p-3 rounded-xl border text-xs font-mono space-y-2 ${
              displayStatus.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-200'
            }`}
          >
            <div className="flex items-start gap-2">
              {displayStatus.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="text-[11px] leading-relaxed break-words font-mono flex-1 font-medium">
                {displayStatus.text}
              </div>
            </div>

            {/* Quick action button for Push / Authentication failures */}
            {displayStatus.type === 'error' &&
              onOpenRemoteAuth &&
              (displayStatus.text.includes('Push failed') ||
                displayStatus.text.toLowerCase().includes('auth') ||
                displayStatus.text.toLowerCase().includes('remote') ||
                displayStatus.text.toLowerCase().includes('permission') ||
                displayStatus.text.toLowerCase().includes('ssh') ||
                displayStatus.text.toLowerCase().includes('token')) && (
                <div className="pt-1 flex items-center justify-end">
                  <button
                    onClick={onOpenRemoteAuth}
                    className="px-2.5 py-1 rounded-[33px] bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 dark:text-rose-200 dark:border-rose-500/30 text-[10px] font-sans font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Globe className="w-3 h-3 text-rose-700 dark:text-rose-300" />
                    <span>Configure Remote / Auth</span>
                  </button>
                </div>
              )}
          </div>
        )}
        <PushResults report={pushState.report} busy={pushState.pushing} retry={() => { const report = pushState.report; if (report) pushState.push(report.commitHash, report.results.filter(result => result.status !== 'verified').map(result => result.destination)).catch(error => setStatusMessage({ text: error.message, type: 'error' })); }} />
        </div>}

      {/* Action Buttons */}
      {activeTab === 'commit' && <div className="p-4 border-t border-[var(--border-subtle)] space-y-2 shrink-0">
        <button
          onClick={() => handleCommit(false)}
          disabled={isCommitting || !hasStagedChanges || !commitMessage.trim()}
          className="w-full py-2.5 rounded-[33px] border border-[var(--border-interactive)] hover:border-[var(--text-muted)] bg-transparent text-[var(--text-primary)] text-xs font-medium transition disabled:opacity-30"
        >
          {isCommitting ? 'Committing...' : 'Commit Changes'}
        </button>

        <button
          onClick={() => handleCommit(true)}
          disabled={isCommitting || !hasStagedChanges || !commitMessage.trim() || !pushState.destinations.length || pushState.pushing}
          className="w-full py-2.5 rounded-[33px] bg-[var(--btn-primary-bg)] hover:opacity-90 text-[var(--btn-primary-text)] font-semibold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-30"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Commit & Push{pushState.destinations.length > 1 ? ` to ${pushState.destinations.length}` : ''}</span>
        </button>
      </div>}
    </aside>
  );
};
