import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import path from 'path';

export interface RepoSummary {
  name: string;
  path: string;
  currentBranch: string;
  isClean: boolean;
  ahead: number;
  behind: number;
  stagedCount: number;
  unstagedCount: number;
  tracking?: string | null;
  remotes: { name: string; fetchUrl?: string; pushUrl?: string }[];
  lastCommit?: {
    hash: string;
    message: string;
    author: string;
    date: string;
  } | null;
}

export interface FileChange {
  path: string;
  indexStatus: string;
  workingDirStatus: string;
  isStaged: boolean;
}

export interface RepoDetails extends RepoSummary {
  files: FileChange[];
  branches: {
    all: string[];
    current: string;
    local: string[];
    remote: string[];
  };
  recentCommits: {
    hash: string;
    message: string;
    author_name: string;
    date: string;
  }[];
}

export function getGit(repoPath: string): SimpleGit {
  return simpleGit({ baseDir: repoPath, maxConcurrentProcesses: 4 });
}

export async function getRepoSummary(repoPath: string): Promise<RepoSummary> {
  const git = getGit(repoPath);
  const repoName = path.basename(repoPath);

  try {
    const status: StatusResult = await git.status();
    const remotes = await git.getRemotes(true);

    let lastCommit = null;
    try {
      const log = await git.log({ maxCount: 1 });
      if (log.latest) {
        lastCommit = {
          hash: log.latest.hash.substring(0, 7),
          message: log.latest.message,
          author: log.latest.author_name,
          date: log.latest.date
        };
      }
    } catch {
      // Empty repo with no commits yet
    }

    const stagedCount = status.staged.length + status.created.filter(f => status.staged.includes(f)).length;
    const unstagedCount = status.not_added.length + status.modified.filter(f => !status.staged.includes(f)).length + status.deleted.filter(f => !status.staged.includes(f)).length;

    return {
      name: repoName,
      path: repoPath,
      currentBranch: status.current || 'HEAD (detached)',
      isClean: status.isClean(),
      ahead: status.ahead,
      behind: status.behind,
      stagedCount,
      unstagedCount,
      tracking: status.tracking || null,
      remotes: remotes.map(r => ({
        name: r.name,
        fetchUrl: r.refs.fetch,
        pushUrl: r.refs.push
      })),
      lastCommit
    };
  } catch (error: any) {
    return {
      name: repoName,
      path: repoPath,
      currentBranch: 'unknown',
      isClean: false,
      ahead: 0,
      behind: 0,
      stagedCount: 0,
      unstagedCount: 0,
      remotes: [],
      lastCommit: null
    };
  }
}

export async function getRepoDetails(repoPath: string): Promise<RepoDetails> {
  const git = getGit(repoPath);
  const summary = await getRepoSummary(repoPath);
  const status = await git.status();

  const fileMap = new Map<string, FileChange>();

  // Process staged files
  for (const f of status.staged) {
    fileMap.set(f, {
      path: f,
      indexStatus: 'staged',
      workingDirStatus: 'clean',
      isStaged: true
    });
  }

  // Process modified files
  for (const f of status.modified) {
    const existing = fileMap.get(f);
    if (existing) {
      existing.workingDirStatus = 'modified';
    } else {
      fileMap.set(f, {
        path: f,
        indexStatus: 'unmodified',
        workingDirStatus: 'modified',
        isStaged: false
      });
    }
  }

  // Untracked / newly created files
  for (const f of status.not_added) {
    fileMap.set(f, {
      path: f,
      indexStatus: 'untracked',
      workingDirStatus: 'created',
      isStaged: false
    });
  }

  // Deleted files
  for (const f of status.deleted) {
    const existing = fileMap.get(f);
    if (existing) {
      existing.workingDirStatus = 'deleted';
    } else {
      fileMap.set(f, {
        path: f,
        indexStatus: 'unmodified',
        workingDirStatus: 'deleted',
        isStaged: false
      });
    }
  }

  // Branches
  const branchSummary = await git.branch(['-a']);
  const localBranches: string[] = [];
  const remoteBranches: string[] = [];

  for (const b of branchSummary.all) {
    if (b.startsWith('remotes/')) {
      remoteBranches.push(b);
    } else {
      localBranches.push(b);
    }
  }

  // Recent commits
  let recentCommits: any[] = [];
  try {
    const log = await git.log({ maxCount: 20 });
    recentCommits = log.all.map(c => ({
      hash: c.hash.substring(0, 7),
      message: c.message,
      author_name: c.author_name,
      date: c.date
    }));
  } catch {
    // Brand new repo
  }

  return {
    ...summary,
    files: Array.from(fileMap.values()),
    branches: {
      all: branchSummary.all,
      current: branchSummary.current || summary.currentBranch,
      local: localBranches,
      remote: remoteBranches
    },
    recentCommits
  };
}

export async function getDiff(repoPath: string, filepath?: string, staged?: boolean): Promise<string> {
  const git = getGit(repoPath);
  const options = [];
  if (staged) {
    options.push('--staged');
  }
  if (filepath) {
    options.push('--', filepath);
  }
  return await git.diff(options);
}

export async function stageFiles(repoPath: string, files?: string[]): Promise<void> {
  const git = getGit(repoPath);
  if (!files || files.length === 0 || (files.length === 1 && files[0] === '.')) {
    await git.add('.');
  } else {
    await git.add(files);
  }
}

export async function unstageFiles(repoPath: string, files?: string[]): Promise<void> {
  const git = getGit(repoPath);
  if (!files || files.length === 0) {
    await git.reset(['HEAD']);
  } else {
    await git.reset(['HEAD', '--', ...files]);
  }
}

export async function commit(repoPath: string, message: string): Promise<string> {
  const git = getGit(repoPath);
  const result = await git.commit(message);
  return result.commit;
}

export async function push(repoPath: string, remote = 'origin', branch?: string): Promise<string> {
  const git = getGit(repoPath);
  const currentBranch = branch || (await git.status()).current;
  const result = await git.push(remote, currentBranch, ['-u']);
  return result ? 'Pushed successfully' : 'Push completed';
}

export async function pull(repoPath: string): Promise<string> {
  const git = getGit(repoPath);
  const result = await git.pull();
  return `Pulled: ${result.summary.changes} changes`;
}

export async function fetchAll(repoPath: string): Promise<string> {
  const git = getGit(repoPath);
  await git.fetch(['--all']);
  return 'Fetched remotes';
}

export async function checkout(repoPath: string, branchName: string, createNew = false): Promise<string> {
  const git = getGit(repoPath);
  if (createNew) {
    await git.checkoutLocalBranch(branchName);
  } else {
    await git.checkout(branchName);
  }
  return `Switched to ${branchName}`;
}
