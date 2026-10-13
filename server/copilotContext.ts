import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { getRepoDetails, getDiff } from './gitService';
import { validateFilePath } from './security';
import { redactRemote } from './remoteSafety';

export function safeContextFile(repoPath: string, file: string) {
  validateFilePath(repoPath, file);
  if (/(^|\/)(\.env(?:\..*)?|\.git|node_modules|vendor|dist|build|\.next|coverage|\.ssh|\.gitler)(\/|$)|(?:^|\/)(?:id_rsa|id_ed25519|credentials|secrets)(?:\.|$)|\.(?:pem|p12|pfx|key|keystore)$/i.test(file)) throw new Error('This file is excluded from Copilot context.');
  const real = fs.realpathSync(path.join(repoPath, file));
  const relative = path.relative(fs.realpathSync(repoPath), real);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('This file is outside the repository.');
  return real;
}
export async function gatherContext(repos: string[], question: string, commit?: string) {
  const sources: { repository: string; file?: string; commit?: string; kind: string }[] = [];
  let budget = 18000; let truncated = false; const parts: string[] = [];
  const add = (value: string, source: typeof sources[number]) => {
    if (budget <= 0) { truncated = true; return; }
    const clean = redactRemote(value).replace(/((?:api[_-]?key|password|secret|token)\s*[:=]\s*)["']?[^\s"',;]+/gi, '$1[redacted]');
    const limit = Math.min(budget, 6500); parts.push(clean.slice(0, limit)); sources.push(source);
    if (clean.length > limit) truncated = true; budget -= Math.min(limit, clean.length);
  };
  for (const repo of repos) {
    const details = await getRepoDetails(repo); const git = simpleGit(repo);
    add(`REPOSITORY ${details.name}\nBranch: ${details.currentBranch}\nTracking: ${details.tracking}\nRemotes: ${JSON.stringify(details.remotes)}\nFiles: ${JSON.stringify(details.files)}\nRecent commits: ${JSON.stringify(details.recentCommits)}`, { repository: repo, kind: 'status and history' });
    const hash = commit || question.match(/\b[0-9a-f]{7,40}\b/i)?.[0] || (/latest|last commit/i.test(question) ? details.recentCommits[0]?.hash : undefined);
    if (hash) {
      if (!/^[0-9a-f]{7,40}$/i.test(hash)) throw new Error('Invalid commit identifier.');
      const full = (await git.raw(['rev-parse', '--verify', `${hash}^{commit}`])).trim();
      const changed = (await git.raw(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', full])).split('\n').filter(Boolean);
      const safeFiles = changed.filter(file => { try { safeContextFile(repo, file); return true; } catch { return false; } });
      add(await git.raw(['--literal-pathspecs', 'show', '--format=fuller', '--stat', full]), { repository: repo, commit: full, kind: 'commit summary' });
      if (safeFiles.length) add(await git.raw(['--literal-pathspecs', 'show', '--format=', full, '--', ...safeFiles.slice(0, 12)]), { repository: repo, commit: full, kind: 'commit diff' });
    }
    for (const staged of (!hash && /change|review|diff|working|staged|uncommitted/i.test(question) ? [true, false] : [])) {
      const files = details.files.filter(file => staged ? file.isStaged : file.isUnstaged);
      const diffs = await Promise.all(files.slice(0, 12).map(async file => {
        try { safeContextFile(repo, file.path); } catch { return null; }
        return { file, diff: await getDiff(repo, file.path, staged) };
      }));
      for (const entry of diffs) if (entry) add(`${staged ? 'STAGED' : 'WORKING'} DIFF ${entry.file.path}\n${entry.diff}`, { repository: repo, file: entry.file.path, kind: staged ? 'staged diff' : 'working diff' });
      if (files.length > 12) truncated = true;
    }
    const files = (await git.raw(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean);
    add(`Repository file names:\n${files.filter(file => { try { safeContextFile(repo, file); return true; } catch { return false; } }).slice(0, 180).join('\n')}`, { repository: repo, kind: 'file index' });
    const terms = question.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) || [];
    const ranked = files.map(file => ({ file, score: (/readme|package.json|cargo.toml|pyproject.toml/i.test(file) ? 2 : 0) + terms.filter(term => file.toLowerCase().includes(term)).length * 3 })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
    for (const {file} of ranked.slice(0, 8)) {
      try {
        const real = safeContextFile(repo, file); const stat = fs.statSync(real); if (!stat.isFile() || stat.size > 128 * 1024) continue;
        const data = fs.readFileSync(real); if (data.includes(0)) continue;
        add(`FILE ${file}\n${data.toString('utf8')}`, { repository: repo, file, kind: 'file' });
      } catch {}
    }
  }
  return { text: parts.join('\n\n'), sources, truncated };
}
