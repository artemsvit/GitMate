import React, { useState } from 'react';
import { X, Cpu, CheckCircle2, AlertCircle, Terminal, RefreshCw } from 'lucide-react';
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
        setTestResult('No local AI instance detected on port 11434. Smart heuristics active.');
      }
      onRefreshStatus();
    } catch (err: any) {
      setTestResult(`Test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#000000]/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121212] border border-[#333333] rounded-2xl w-full max-w-lg shadow-none overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#1e1e1d] flex items-center justify-between bg-[#121212]">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-[#1e1e1d] border border-[#333333] flex items-center justify-center text-[#cbb0f7]">
              <Cpu className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-[#faf9f6]">Local AI Engine</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-[#868684] hover:text-[#faf9f6] hover:bg-[#1e1e1d] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs text-[#b4b4b2]">
          
          {/* Status Box */}
          <div className="p-3.5 rounded-xl border border-[#1e1e1d] bg-[#1e1e1d] flex items-start gap-3">
            {aiStatus?.available ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#cbb0f7] mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-[#868684] mt-0.5" />
            )}
            <div>
              <div className="font-semibold text-xs text-[#faf9f6]">
                {aiStatus?.available
                  ? `Active: ${aiStatus.provider.toUpperCase()} (${aiStatus.activeModel})`
                  : 'Local AI Offline — Smart Heuristics Active'}
              </div>
              <p className="text-[11px] mt-1 text-[#868684] leading-relaxed">
                {aiStatus?.available
                  ? `Gitler communicates directly with your local hardware on ${aiStatus.endpoint}. Zero code or diff leaves your device.`
                  : 'No local Ollama or LM Studio process was detected on port 11434. Gitler uses intelligent heuristics to format Conventional Commits.'}
              </p>
            </div>
          </div>

          {/* Running Gemma locally on Mac */}
          <div className="bg-[#000000] border border-[#1e1e1d] rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-[#faf9f6] text-[11px]">
              <Terminal className="w-3.5 h-3.5 text-[#cbb0f7]" />
              <span>Run Local AI on macOS (Apple Silicon)</span>
            </div>
            <p className="text-[#868684] text-[11px] leading-relaxed">
              Install and run Google Gemma 2 or Qwen with one terminal command:
            </p>
            <div className="bg-[#121212] border border-[#1e1e1d] rounded-lg p-2.5 font-mono text-[11px] text-[#cbb0f7] select-all leading-normal">
              ollama run gemma2
            </div>
          </div>

          {/* Test connection result */}
          {testResult && (
            <div className="p-2.5 rounded-lg bg-[#000000] border border-[#1e1e1d] font-mono text-[11px] text-[#b4b4b2]">
              {testResult}
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between border-t border-[#1e1e1d]">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[33px] border border-[#333333] hover:border-[#868684] text-[#faf9f6] text-xs font-medium transition disabled:opacity-30"
            >
              <RefreshCw className={`w-3 h-3 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Testing...' : 'Test Connection'}</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-[33px] bg-[#faf9f6] hover:bg-[#ffffff] text-[#080808] text-xs font-semibold transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
