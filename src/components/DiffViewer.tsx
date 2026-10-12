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
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
        <Check className="w-10 h-10 text-slate-600 mb-2" />
        <p className="text-sm font-medium text-slate-400">No diff changes to show</p>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          {staged ? 'No staged changes for this selection.' : 'Working directory is clean for this file.'}
        </p>
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-xl border border-slate-800 overflow-hidden text-xs font-mono">
      {/* File Diff Header */}
      {filename && (
        <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300">
            <FileCode className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-semibold">{filename}</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
            staged ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
          }`}>
            {staged ? 'Staged Diff' : 'Working Diff'}
          </span>
        </div>
      )}

      {/* Diff Lines Container */}
      <div className="flex-1 overflow-auto p-3 space-y-0.5 select-text">
        {lines.map((line, idx) => {
          let lineClass = 'text-slate-300';
          let bgClass = '';

          if (line.startsWith('+') && !line.startsWith('+++')) {
            lineClass = 'text-emerald-400';
            bgClass = 'bg-emerald-950/40 border-l-2 border-emerald-500';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineClass = 'text-rose-400';
            bgClass = 'bg-rose-950/40 border-l-2 border-rose-500';
          } else if (line.startsWith('@@')) {
            lineClass = 'text-indigo-400 font-semibold';
            bgClass = 'bg-indigo-950/30 my-1 py-0.5 rounded';
          } else if (line.startsWith('diff --git') || line.startsWith('index ')) {
            lineClass = 'text-slate-400 font-semibold';
            bgClass = 'border-t border-slate-800/80 pt-1 mt-1';
          }

          return (
            <div
              key={idx}
              className={`px-2 py-0.5 whitespace-pre font-mono flex items-start gap-3 ${bgClass} ${lineClass}`}
            >
              <span className="w-8 shrink-0 text-slate-400 text-right select-none text-[11px]">
                {idx + 1}
              </span>
              <span className="flex-1 overflow-x-auto">{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
