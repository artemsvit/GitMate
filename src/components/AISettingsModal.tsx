import React, { useState } from 'react';
import { X, Sparkles, Cpu, CheckCircle2, AlertCircle, Terminal, RefreshCw, ExternalLink } from 'lucide-react';
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

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/status');
      const data: LocalAIStatus = await res.json();
      if (data.available) {
        setTestResult(`Connected to ${data.provider.toUpperCase()} (${data.models.length} models detected: ${data.models.slice(0, 3).join(', ')})`);
      } else {
        setTestResult('No active local AI server detected. Falling back to built-in smart heuristics.');
      }
      onRefreshStatus();
    } catch (err: any) {
      setTestResult(`Test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Local AI Engine Settings</h2>
              <p className="text-xs text-slate-400">Apple Silicon & Local Model Integration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-slate-300">
          
          {/* Status Box */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            aiStatus?.available
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}>
            {aiStatus?.available ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
            )}
            <div>
              <div className="font-semibold text-sm">
                {aiStatus?.available
                  ? `Active: ${aiStatus.provider.toUpperCase()} (${aiStatus.activeModel})`
                  : 'Local AI Offline — Smart Heuristic Active'}
              </div>
              <p className="text-xs mt-1 text-slate-300/80">
                {aiStatus?.available
                  ? `Gitler is utilizing your local hardware to generate privacy-first commit messages at ${aiStatus.endpoint}.`
                  : 'No local AI instance was detected on port 11434 (Ollama) or 1234 (LM Studio). Gitler will automatically generate clean Conventional Commits using intelligent code heuristics.'}
              </p>
            </div>
          </div>

          {/* How to run Gemma on Mac Guide */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 font-bold text-white">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>How to run Gemma on macOS (100% Free & Private)</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              You can run Google's Gemma model locally in seconds using Ollama on your Mac terminal:
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] text-indigo-300 select-all">
              curl -fsSL https://ollama.com/install.sh | sh<br />
              ollama run gemma2
            </div>
            <p className="text-[11px] text-slate-400">
              Once running, click <strong className="text-slate-300">"Test & Refresh Connection"</strong> below and Gitler will immediately detect it!
            </p>
          </div>

          {/* Test connection result */}
          {testResult && (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300">
              {testResult}
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Testing...' : 'Test & Refresh Connection'}</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
