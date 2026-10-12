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
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[#868684] bg-[#000000] rounded-2xl border border-[#1e1e1d]">
        <Check className="w-8 h-8 text-[#333333] mb-2" />
        <p className="text-xs font-medium text-[#b4b4b2]">No differences detected</p>
        <p className="text-[11px] text-[#868684] mt-1 max-w-xs font-mono">
          {staged ? 'No staged changes for this selection.' : 'Working tree is clean for this file.'}
        </p>
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div className="flex flex-col h-full bg-[#000000] rounded-2xl border border-[#1e1e1d] overflow-hidden text-xs font-mono">
      {/* File Diff Header */}
      {filename && (
        <div className="px-4 py-2.5 bg-[#121212] border-b border-[#1e1e1d] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#faf9f6]">
            <FileCode className="w-3.5 h-3.5 text-[#cbb0f7]" />
            <span className="font-semibold text-xs tracking-tight">{filename}</span>
          </div>
          <span className={`px-2.5 py-0.5 rounded-[50px] text-[10px] font-mono uppercase tracking-wider border ${
            staged
              ? 'bg-[#1e1e1d] border-[#333333] text-[#faf9f6]'
              : 'bg-transparent border-[#1e1e1d] text-[#868684]'
          }`}>
            {staged ? 'Staged' : 'Working Tree'}
          </span>
        </div>
      )}

      {/* Diff Lines Container */}
      <div className="flex-1 overflow-auto p-2 space-y-0.5 select-text bg-[#000000]">
        {lines.map((line, idx) => {
          let lineClass = 'text-[#b4b4b2]';
          let bgClass = '';

          if (line.startsWith('+') && !line.startsWith('+++')) {
            lineClass = 'text-[#86e19b]';
            bgClass = 'bg-[#0f1d13] border-l-2 border-[#52b774]';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineClass = 'text-[#f28b82]';
            bgClass = 'bg-[#1f1012] border-l-2 border-[#d9534f]';
          } else if (line.startsWith('@@')) {
            lineClass = 'text-[#cbb0f7] font-semibold';
            bgClass = 'bg-[#121212] my-1 py-0.5 rounded';
          } else if (line.startsWith('diff --git') || line.startsWith('index ')) {
            lineClass = 'text-[#868684] font-medium';
            bgClass = 'border-t border-[#1e1e1d] pt-1 mt-1';
          }

          return (
            <div
              key={idx}
              className={`px-2 py-0.5 whitespace-pre font-mono flex items-start gap-3 ${bgClass} ${lineClass}`}
            >
              <span className="w-7 shrink-0 text-[#666469] text-right select-none text-[11px]">
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
