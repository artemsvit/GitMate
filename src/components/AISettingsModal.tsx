import { apiFetch } from '../api';
import React, { useState } from 'react';
import { X, Cpu, CheckCircle2, RefreshCw, Zap, ShieldCheck } from 'lucide-react';
import { LocalAIStatus } from '../types';

interface AISettingsModalProps {
  aiStatus: LocalAIStatus | null;
  onClose: () => void;
  onRefreshStatus: () => void;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  aiStatus,
  onClose,
  onRefreshStatus
}) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'embedded' | 'external'>(() => {
    return (localStorage.getItem('gitler_ai_mode') as 'embedded' | 'external') || 'embedded';
  });

  const handleSelectMode = (mode: 'embedded' | 'external') => {
    setActiveMode(mode);
    localStorage.setItem('gitler_ai_mode', mode);
    onRefreshStatus();
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch(`/api/ai/status?mode=${activeMode}`);
      const data: LocalAIStatus = await res.json();
      if (activeMode === 'embedded') {
        setTestResult('Built-in commit suggestions are ready. Messages use local rules and staged changes.');
      } else if (data.hasExternal) {
        setTestResult(`External Provider Connected: ${data.externalProvider?.toUpperCase()} (${data.externalActiveModel}) on ${data.externalEndpoint}`);
      } else {
        setTestResult('No external AI daemon detected on port 11434. Using built-in commit suggestions.');
      }
      onRefreshStatus();
    } catch (err: any) {
      setTestResult(`Status check failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl w-full max-w-lg shadow-none overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-[var(--bg-card)] border border-[var(--border-interactive)] flex items-center justify-center text-[var(--accent-violet)]">
              <Cpu className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-[var(--text-primary)]">AI Intelligence Engine</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs text-[var(--text-secondary)]">
          
          {/* Active Engine Card */}
          <div className="p-3.5 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--accent-violet)] mt-0.5" />
            <div>
              <div className="font-semibold text-xs text-[var(--text-primary)] flex items-center gap-2">
                <span>
                  {activeMode === 'embedded'
                    ? 'Active: Gitler Commit Suggestions (Built-in)'
                    : `Active: ${aiStatus?.externalProvider?.toUpperCase() || 'External'} (${aiStatus?.externalActiveModel || 'Local Model'})`}
                </span>
                <span className="px-2 py-0.5 rounded-[50px] bg-[var(--bg-surface)] border border-[var(--border-interactive)] text-[10px] font-mono text-[var(--accent-violet)]">
                  On-Device
                </span>
              </div>
              <p className="text-[11px] mt-1.5 text-[var(--text-muted)] leading-relaxed">
                {activeMode === 'embedded'
                  ? 'Integrated directly into Gitler. Zero configuration or external software required. 100% private, on-device diff analysis.'
                  : `Communicating with local daemon at ${aiStatus?.externalEndpoint || 'http://127.0.0.1:11434'}. Zero telemetry or code leaves your device.`}
              </p>
            </div>
          </div>

          {/* Engine Selection Options */}
          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-medium text-[var(--text-primary)]">Choose AI Mode</span>
            
            {/* Mode 1: Embedded Engine */}
            <div
              onClick={() => handleSelectMode('embedded')}
              className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                activeMode === 'embedded'
                  ? 'border-[var(--accent-violet)] bg-[var(--bg-surface)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--text-muted)]'
              }`}
            >
              <Zap className="w-4 h-4 text-[var(--accent-violet)] shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-[var(--text-primary)]">
                    Gitler Commit Suggestions (Recommended)
                  </span>
                  <span className="text-[10px] font-mono text-[var(--accent-violet)]">Built-in</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
                  Incorporated directly inside the application. Instantaneous, zero dependencies, no terminal commands, works completely offline.
                </p>
              </div>
            </div>

            {/* Mode 2: External Daemon (Ollama / LM Studio) */}
            <div
              onClick={() => handleSelectMode('external')}
              className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 ${
                activeMode === 'external'
                  ? 'border-[var(--accent-violet)] bg-[var(--bg-surface)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--text-muted)]'
              }`}
            >
              <Cpu className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-[var(--text-primary)]">
                    External Local LLM (Optional)
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    {aiStatus?.hasExternal ? `Detected: ${aiStatus.externalProvider}` : 'Optional'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
                  {aiStatus?.hasExternal
                    ? `Detected running daemon: ${aiStatus.externalProvider?.toUpperCase()} (${aiStatus.externalActiveModel}). Connects via loopback.`
                    : 'If you run an external Ollama or LM Studio instance on your machine, Gitler can connect to it.'}
                </p>
              </div>
            </div>
          </div>

          {/* Privacy Guarantee */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Privacy Guaranteed: All code diffs and tokens are processed 100% locally on your machine.</span>
          </div>

          {/* Test connection result */}
          {testResult && (
            <div className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-secondary)]">
              {testResult}
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between border-t border-[var(--border-subtle)]">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[33px] border border-[var(--border-interactive)] hover:border-[var(--text-muted)] text-[var(--text-primary)] text-xs font-medium transition disabled:opacity-30"
            >
              <RefreshCw className={`w-3 h-3 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Verifying...' : 'Verify Engine'}</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-[33px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-semibold transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
