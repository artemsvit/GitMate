import React, { useState } from 'react';
import { FileCode, Check, WrapText } from 'lucide-react';

interface DiffViewerProps {
  preview?: { dataUrl?: string; error?: string } | null;
  diff: string;
  filename?: string;
  staged?: boolean;
  // Overrides the Staged / Working Tree badge, for example "Commit 1a2b3c4".
  source?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff, filename, staged, preview, source }) => {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(true);
  const [isWrapped, setIsWrapped] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gitmate_diff_wrap') === 'true';
    } catch {
      return false;
    }
  });

  const toggleWrap = () => {
    setIsWrapped(prev => {
      const next = !prev;
      try {
        localStorage.setItem('gitmate_diff_wrap', String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  if ((!diff || diff.trim() === '') && !preview) {
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
        <div className="px-4 py-2.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[var(--text-primary)] min-w-0 flex-1">
            <FileCode className="w-3.5 h-3.5 text-[var(--accent-violet)] shrink-0" />
            <span className="font-semibold text-xs tracking-tight truncate select-text" title={filename}>
              {filename}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {preview && <button type="button" onClick={() => setShowImage(value => !value)} className="rounded border px-2 py-1 text-xs">{showImage ? 'Show diff' : 'Show image'}</button>}
            {/* Word Wrap Toggle Button */}
            <button
              type="button"
              onClick={toggleWrap}
              aria-pressed={isWrapped}
              title={isWrapped ? 'Disable word wrap (scroll horizontally)' : 'Enable word wrap'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[33px] text-[11px] font-mono transition cursor-pointer border ${
                isWrapped
                  ? 'bg-[var(--btn-secondary-bg)] border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)] font-semibold shadow-xs'
                  : 'bg-transparent border-[var(--border-interactive)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)]'
              }`}
            >
              <WrapText className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{isWrapped ? 'Wrapped' : 'Wrap'}</span>
            </button>

            <span className={`px-2.5 py-1 rounded-[50px] text-[10px] font-mono uppercase tracking-wider border ${
              staged
                ? 'bg-[var(--bg-card)] border-[var(--border-interactive)] text-[var(--text-primary)] font-semibold'
                : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-secondary)]'
            }`}>
              {source || (staged ? 'Staged' : 'Working Tree')}
            </span>
          </div>
        </div>
      )}

      {preview && showImage ? (
        <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4 bg-[var(--bg-surface)]">
          {preview.dataUrl && failedImage !== preview.dataUrl ? <img onError={() => setFailedImage(preview.dataUrl!)} src={preview.dataUrl} alt={`Preview of ${filename}`} className="max-w-full max-h-full object-contain" /> : <p className="text-sm text-[var(--text-muted)]">{preview.error || (failedImage === preview.dataUrl ? 'This image could not be decoded. Use Show diff to inspect the file.' : 'Loading image…')}</p>}
        </div>
      ) : <div className="flex-1 overflow-auto p-2 space-y-0.5 select-text bg-[var(--bg-canvas)]">
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
              className={`px-2 py-0.5 font-mono flex items-start gap-3 ${bgClass} ${lineClass} ${
                isWrapped ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
              }`}
            >
              <span className="w-7 shrink-0 text-[var(--text-dim)] text-right select-none text-[11px] pt-0.5">
                {idx + 1}
              </span>
              <span className={`flex-1 leading-relaxed ${isWrapped ? 'break-words overflow-hidden' : 'overflow-x-auto'}`}>
                {line}
              </span>
            </div>
          );
        })}
      </div>}
    </div>
  );
};
