import React, { useState } from 'react';
import { FolderSearch, Folder, Search, CornerDownRight } from 'lucide-react';

interface FolderPreset {
  name: string;
  path: string;
}

interface FolderSelectorProps {
  currentPath: string;
  presets: FolderPreset[];
  isScanning: boolean;
  onScan: (path: string, depth: number) => void;
}

export const FolderSelector: React.FC<FolderSelectorProps> = ({
  currentPath,
  presets,
  isScanning,
  onScan
}) => {
  const [inputPath, setInputPath] = useState(currentPath);
  const [depth, setDepth] = useState(3);

  // Sync input if currentPath updates
  React.useEffect(() => {
    setInputPath(currentPath);
  }, [currentPath]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) {
      onScan(inputPath.trim(), depth);
    }
  };

  const handleSelectPreset = (p: FolderPreset) => {
    setInputPath(p.path);
    onScan(p.path, depth);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-col gap-4">
        {/* Preset Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-1">
            <Folder className="w-3.5 h-3.5" /> Quick Folders:
          </span>
          {presets.map(p => {
            const isSelected = inputPath === p.path;
            return (
              <button
                key={p.path}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700/60 text-slate-300 hover:text-white'
                }`}
              >
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Path Input Form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <FolderSearch className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={inputPath}
              onChange={e => setInputPath(e.target.value)}
              placeholder="Enter folder path to scan (e.g. /Users/username/Desktop)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition font-mono"
            />
          </div>

          {/* Depth selector */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <span className="text-slate-400">Scan Depth:</span>
            <select
              value={depth}
              onChange={e => setDepth(Number(e.target.value))}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value={2} className="bg-slate-900 text-white">2 levels</option>
              <option value={3} className="bg-slate-900 text-white">3 levels</option>
              <option value={4} className="bg-slate-900 text-white">4 levels</option>
            </select>
          </div>

          {/* Scan Button */}
          <button
            type="submit"
            disabled={isScanning || !inputPath.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/20 transition disabled:opacity-50 cursor-pointer"
          >
            {isScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Scanning...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Scan Folder</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
