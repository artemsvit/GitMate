import React from 'react';
import { FileCode, Check } from 'lucide-react';

interface DiffViewerProps {
  diff: string;
  filename?: string;
  staged?: boolean;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff, filename, staged }) => {
  if (!diff || diff.trim() === '') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[var(--text-muted)] bg-[var(--bg-canvas)] rounded-2xl border border-[var(--border-subtle)]">
        <Check className="w-8 h-8 text-[var(--border-interactive)] mb-2" />
        <p className="text-xs font-medium text-[var(--text-secondary)]">No differences detected</p>
        <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-xs font-mono">
          {staged ? 'No staged changes for this selection.' : 'Working tree is clean for this file.'}
        </p>
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div className="flex flex-col h-full bg-[var(--bg-canvas)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden text-xs font-mono transition-colors">
      {/* File Diff Header */}
      {filename && (
        <div className="px-4 py-2.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <FileCode className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
            <span className="font-semibold text-xs tracking-tight">{filename}</span>
          </div>
          <span className={`px-2.5 py-0.5 rounded-[50px] text-[10px] font-mono uppercase tracking-wider border ${
            staged
              ? 'bg-[var(--bg-card)] border-[var(--border-interactive)] text-[var(--text-primary)]'
              : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-muted)]'
          }`}>
            {staged ? 'Staged' : 'Working Tree'}
          </span>
        </div>
      )}

      {/* Diff Lines Container */}
      <div className="flex-1 overflow-auto p-2 space-y-0.5 select-text bg-[var(--bg-canvas)]">
        {lines.map((line, idx) => {
          let lineClass = 'text-[var(--text-secondary)]';
          let bgClass = '';

          if (line.startsWith('+') && !line.startsWith('+++')) {
            lineClass = 'text-emerald-500 dark:text-[#86e19b] font-medium';
            bgClass = 'bg-emerald-500/10 dark:bg-[#0f1d13] border-l-2 border-emerald-500 dark:border-[#52b774]';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineClass = 'text-rose-500 dark:text-[#f28b82] font-medium';
            bgClass = 'bg-rose-500/10 dark:bg-[#1f1012] border-l-2 border-rose-500 dark:border-[#d9534f]';
          } else if (line.startsWith('@@')) {
            lineClass = 'text-[var(--accent-violet)] font-semibold';
            bgClass = 'bg-[var(--bg-surface)] my-1 py-0.5 rounded';
          } else if (line.startsWith('diff --git') || line.startsWith('index ')) {
            lineClass = 'text-[var(--text-muted)] font-medium';
            bgClass = 'border-t border-[var(--border-subtle)] pt-1 mt-1';
          }

          return (
            <div
              key={idx}
              className={`px-2 py-0.5 whitespace-pre font-mono flex items-start gap-3 ${bgClass} ${lineClass}`}
            >
              <span className="w-7 shrink-0 text-[var(--text-dim)] text-right select-none text-[11px]">
                {idx + 1}
              </span>
              <span className="flex-1 overflow-x-auto leading-relaxed">{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
