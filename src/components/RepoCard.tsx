import React from 'react';
import {
  FolderGit2,
  GitBranch,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Clock,
  Sparkles,
  GitPullRequest,
  RefreshCw
} from 'lucide-react';
import { RepoSummary } from '../types';

interface RepoCardProps {
  repo: RepoSummary;
  onInspect: (repo: RepoSummary) => void;
  onQuickSync: (repo: RepoSummary) => void;
  isSyncing?: boolean;
}

export const RepoCard: React.FC<RepoCardProps> = ({
  repo,
  onInspect,
  onQuickSync,
  isSyncing
}) => {
  const originRemote = repo.remotes.find(r => r.name === 'origin') || repo.remotes[0];
  
  // Format remote web URL if it's GitHub/GitLab
  let webUrl = '';
  if (originRemote?.fetchUrl) {
    let url = originRemote.fetchUrl;
    if (url.startsWith('git@')) {
      url = url.replace(':', '/').replace('git@', 'https://');
    }
    if (url.endsWith('.git')) {
      url = url.slice(0, -4);
    }
    webUrl = url;
  }

  const totalChanges = repo.stagedCount + repo.unstagedCount;

  return (
    <div className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg transition-all duration-200 flex flex-col justify-between group hover:shadow-indigo-500/5">
      {/* Top row */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0 text-indigo-400 group-hover:text-indigo-300">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-white truncate group-hover:text-indigo-200 transition">
                {repo.name}
              </h3>
              <p className="text-xs text-slate-400 font-mono truncate max-w-xs" title={repo.path}>
                {repo.path}
              </p>
            </div>
          </div>

          {/* Web link if remote exists */}
          {webUrl && (
            <a
              href={webUrl}
              target="_blank"
              rel="noreferrer"
              title="Open Remote Repository"
              className="text-slate-400 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap my-3">
          {/* Branch badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 text-xs font-mono font-medium border border-slate-700/60">
            <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
            <span className="truncate max-w-[140px]">{repo.currentBranch}</span>
          </div>

          {/* Clean / Dirty Status */}
          {repo.isClean ? (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Clean</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 text-xs font-medium border border-amber-500/20">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>
                {totalChanges} changed {repo.stagedCount > 0 ? `(${repo.stagedCount} staged)` : ''}
              </span>
            </div>
          )}

          {/* Ahead / Behind badges */}
          {repo.ahead > 0 && (
            <div className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-sky-500/10 text-sky-400 text-xs font-medium border border-sky-500/20">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{repo.ahead} ahead</span>
            </div>
          )}

          {repo.behind > 0 && (
            <div className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-rose-500/10 text-rose-400 text-xs font-medium border border-rose-500/20">
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>{repo.behind} behind</span>
            </div>
          )}
        </div>

        {/* Last commit info */}
        {repo.lastCommit ? (
          <div className="mt-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span className="font-mono text-indigo-400 font-semibold">{repo.lastCommit.hash}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(repo.lastCommit.date).toLocaleDateString()}
              </span>
            </div>
            <p className="text-slate-200 line-clamp-1 italic">
              "{repo.lastCommit.message}"
            </p>
          </div>
        ) : (
          <div className="mt-3 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 text-xs text-slate-400 italic">
            No commits recorded yet.
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <button
          onClick={() => onInspect(repo)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/20 text-xs font-semibold transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Inspect & AI</span>
        </button>

        {repo.remotes.length > 0 && (
          <button
            onClick={() => onQuickSync(repo)}
            disabled={isSyncing}
            title="Sync with remote (Pull & Push)"
            className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        )}
      </div>
    </div>
  );
};
