import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git';
import path from 'path';
import fs from 'fs';
import os from 'os';

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

function cleanStaleIndexLock(repoPath: string) {
  try {
    const lockFile = path.join(repoPath, '.git', 'index.lock');
    if (fs.existsSync(lockFile)) {
      const stat = fs.statSync(lockFile);
      if (Date.now() - stat.mtimeMs > 10000) {
        fs.unlinkSync(lockFile);
      }
    }
  } catch {}
}

export function getGit(repoPath: string): SimpleGit {
  cleanStaleIndexLock(repoPath);
  return simpleGit({
    baseDir: repoPath,
    maxConcurrentProcesses: 4,
    spawnOptions: {
      env: {
        ...process.env,
        GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15'
      }
    }
  });
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

export async function push(repoPath: string, remote?: string, branch?: string): Promise<string> {
  const git = getGit(repoPath);
  const status = await git.status();
  const currentBranch = branch || status.current;

  if (!currentBranch) {
    throw new Error('Cannot push: detached HEAD or no active branch found.');
  }

  const remotes = await git.getRemotes(true);
  if (!remotes || remotes.length === 0) {
    throw new Error('No remote repository configured (e.g. origin). Please configure a remote URL first.');
  }

  // Find target remote: prefer requested remote, or 'origin', or first available
  const targetRemote = remote && remotes.some(r => r.name === remote)
    ? remote
    : (remotes.find(r => r.name === 'origin')?.name || remotes[0].name);

  try {
    if (status.tracking) {
      await git.push(targetRemote, currentBranch);
      return `Pushed ${currentBranch} to ${targetRemote}`;
    } else {
      await git.push(targetRemote, currentBranch, ['-u']);
      return `Pushed ${currentBranch} to ${targetRemote} (upstream configured)`;
    }
  } catch (err: any) {
    const msg = err.message || String(err);
    if (msg.includes('non-fast-forward') || msg.includes('fetch first')) {
      throw new Error('Remote contains commits you do not have locally. Please Pull first.');
    }
    if (msg.includes('Permission denied') || msg.includes('publickey') || msg.includes('Authentication failed')) {
      throw new Error(`Authentication failed for ${targetRemote}. Check your SSH keys or credentials.`);
    }
    throw new Error(msg);
  }
}

export async function pull(repoPath: string, remote?: string, branch?: string): Promise<string> {
  const git = getGit(repoPath);
  const status = await git.status();
  const currentBranch = branch || status.current;

  if (!currentBranch) {
    throw new Error('Cannot pull: detached HEAD or no active branch found.');
  }

  const remotes = await git.getRemotes(true);
  if (!remotes || remotes.length === 0) {
    throw new Error('No remote repository configured. Please configure a remote URL first.');
  }

  const targetRemote = remote && remotes.some(r => r.name === remote)
    ? remote
    : (remotes.find(r => r.name === 'origin')?.name || remotes[0].name);

  try {
    let result;
    if (status.tracking) {
      result = await git.pull();
    } else {
      result = await git.pull(targetRemote, currentBranch);
    }
    const changes = result?.summary?.changes ?? 0;
    const insertions = result?.summary?.insertions ?? 0;
    const deletions = result?.summary?.deletions ?? 0;
    return `Pulled successfully (${changes} changes, +${insertions}/-${deletions})`;
  } catch (err: any) {
    const msg = err.message || String(err);
    if (msg.includes('divergent branches') || msg.includes('Need to specify how to reconcile')) {
      throw new Error(`Branches have diverged (${status.ahead} local, ${status.behind} remote). Please reconcile with "git pull --rebase" or stash and merge.`);
    }
    if (msg.includes('overwritten by merge') || msg.includes('local changes')) {
      throw new Error('Cannot pull: you have uncommitted local changes that would be overwritten. Please commit or stash them first.');
    }
    if (msg.includes('Permission denied') || msg.includes('publickey')) {
      throw new Error(`SSH authentication failed for "${targetRemote}". The remote server rejected your SSH key.`);
    }
    if (msg.includes('Authentication failed') || msg.includes('HTTP 401') || msg.includes('HTTP 403')) {
      throw new Error(`Authentication failed for "${targetRemote}". Please check your Personal Access Token or credentials.`);
    }
    if (msg.includes('no tracking information') || msg.includes('Please specify which branch')) {
      try {
        const fallbackRes = await git.pull(targetRemote, currentBranch);
        const changes = fallbackRes?.summary?.changes ?? 0;
        return `Pulled from ${targetRemote}/${currentBranch} (${changes} changes)`;
      } catch (fallbackErr: any) {
        throw new Error(`No tracking information found for branch "${currentBranch}". Run "git branch --set-upstream-to=${targetRemote}/${currentBranch}".`);
      }
    }
    throw new Error(msg);
  }
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

export async function setRemoteUrl(repoPath: string, remoteName: string, newUrl: string): Promise<string> {
  const git = getGit(repoPath);
  await git.remote(['set-url', remoteName, newUrl]);
  return `Updated remote "${remoteName}" to ${newUrl}`;
}

export function getPublicSshKey(): {
  hasKey: boolean;
  publicKey?: string;
  keyType?: string;
  keyFile?: string;
} {
  const home = os.homedir();
  const sshDir = path.join(home, '.ssh');
  const candidates = [
    { file: 'id_ed25519.pub', type: 'ED25519' },
    { file: 'id_rsa.pub', type: 'RSA' },
    { file: 'id_ecdsa.pub', type: 'ECDSA' }
  ];

  for (const c of candidates) {
    const fullPath = path.join(sshDir, c.file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8').trim();
        if (content) {
          return {
            hasKey: true,
            publicKey: content,
            keyType: c.type,
            keyFile: c.file
          };
        }
      } catch {}
    }
  }
  return { hasKey: false };
}

export async function probeHostSsh(host: string, port = 22, user = 'git'): Promise<{
  success: boolean;
  authenticated: boolean;
  provider: 'gitea' | 'github' | 'gitlab' | 'generic';
  user?: string;
  keyName?: string;
  message: string;
  raw: string;
}> {
  const { exec } = await import('child_process');
  const cmd = `ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -p ${port} -T ${user}@${host}`;

  return new Promise(resolve => {
    exec(cmd, { timeout: 6000 }, (_error, stdout, stderr) => {
      const raw = ((stdout || '') + ' ' + (stderr || '')).trim();

      // Gitea detection: "Hi there, artsvit! You've successfully authenticated with the SSH key named mbp16work."
      if (raw.includes('successfully authenticated') && (raw.includes('Gitea') || raw.includes('gitea'))) {
        const userMatch = raw.match(/Hi there,\s+([a-zA-Z0-9_-]+)!/);
        const keyMatch = raw.match(/SSH key named\s+([a-zA-Z0-9_.-]+)/);
        return resolve({
          success: true,
          authenticated: true,
          provider: 'gitea',
          user: userMatch ? userMatch[1] : undefined,
          keyName: keyMatch ? keyMatch[1] : undefined,
          message: `Gitea authentication verified for user "${userMatch ? userMatch[1] : 'user'}" (Key: ${keyMatch ? keyMatch[1] : 'active'})`,
          raw
        });
      }

      // GitHub detection
      if (raw.includes('successfully authenticated') && raw.includes('github.com')) {
        const userMatch = raw.match(/Hi\s+([a-zA-Z0-9_-]+)!/);
        return resolve({
          success: true,
          authenticated: true,
          provider: 'github',
          user: userMatch ? userMatch[1] : undefined,
          message: `GitHub authentication verified for user "${userMatch ? userMatch[1] : 'user'}"`,
          raw
        });
      }

      // GitLab detection
      if (raw.includes('Welcome to GitLab')) {
        const userMatch = raw.match(/@([a-zA-Z0-9_-]+)!/);
        return resolve({
          success: true,
          authenticated: true,
          provider: 'gitlab',
          user: userMatch ? userMatch[1] : undefined,
          message: `GitLab authentication verified for user "${userMatch ? userMatch[1] : 'user'}"`,
          raw
        });
      }

      // Permission denied
      if (raw.includes('Permission denied') || raw.includes('publickey')) {
        const isSelfHosted = !host.includes('github.com') && !host.includes('gitlab.com');
        return resolve({
          success: false,
          authenticated: false,
          provider: isSelfHosted ? 'gitea' : host.includes('github') ? 'github' : 'gitlab',
          message: `SSH key rejected by ${host}:${port}. Please add your public SSH key to your ${isSelfHosted ? 'Gitea' : 'git'} profile settings.`,
          raw
        });
      }

      // Host unreachable or connection failed
      if (raw.includes('Operation timed out') || raw.includes('Connection refused') || raw.includes('No route to host')) {
        return resolve({
          success: false,
          authenticated: false,
          provider: 'generic',
          message: `Cannot connect to ${host}:${port} (${raw.split('\n')[0] || 'timed out'}). Check if the server is online.`,
          raw
        });
      }

      const isAuth = raw.includes('authenticated');
      resolve({
        success: isAuth,
        authenticated: isAuth,
        provider: 'generic',
        message: raw || 'SSH probe finished',
        raw
      });
    });
  });
}

export async function testRemoteConnection(repoPath: string, remoteName = 'origin'): Promise<{
  success: boolean;
  message: string;
  rawError?: string;
  detectedProvider?: string;
  host?: string;
  port?: number;
  sshProbe?: any;
}> {
  const git = getGit(repoPath);
  try {
    const remotes = await git.getRemotes(true);
    const target = remotes.find(r => r.name === remoteName) || remotes[0];
    if (!target) {
      return { success: false, message: 'No remote configured for this repository.' };
    }

    const remoteUrl = target.pushUrl || target.fetchUrl || '';
    let sshProbe: any = null;
    let detectedProvider = 'generic';
    let host: string | undefined;
    let port: number | undefined;

    // Detect SSH host & port: e.g. ssh://git@192.168.0.102:222/artsvit/Open-Pi.git or git@github.com:artemsvit/Gitler.git
    const sshMatch = remoteUrl.match(/^(?:ssh:\/\/)?(?:[a-zA-Z0-9_.-]+@)?([a-zA-Z0-9_.-]+)(?::(\d+))?(?:\/|:)(.*)$/);
    if (sshMatch && (remoteUrl.startsWith('git@') || remoteUrl.startsWith('ssh://'))) {
      host = sshMatch[1];
      port = sshMatch[2] ? parseInt(sshMatch[2], 10) : 22;
      sshProbe = await probeHostSsh(host, port);
      detectedProvider = sshProbe.provider;
    } else if (remoteUrl.includes('github.com')) {
      detectedProvider = 'github';
    } else if (remoteUrl.includes('gitlab.com')) {
      detectedProvider = 'gitlab';
    } else if (remoteUrl.startsWith('http://') || remoteUrl.startsWith('https://')) {
      detectedProvider = 'gitea';
    }

    await git.listRemote([target.name]);
    return {
      success: true,
      message: `Connected to "${target.name}" (${detectedProvider.toUpperCase()}) successfully!`,
      detectedProvider,
      host,
      port,
      sshProbe
    };
  } catch (err: any) {
    const rawError = err.message || String(err);
    let friendly = rawError;

    if (rawError.includes('Permission denied') || rawError.includes('publickey')) {
      friendly = 'SSH key rejected. Please copy your Mac public SSH key and add it to your remote account.';
    } else if (rawError.includes('Host key verification failed')) {
      friendly = 'Host key verification failed. The remote server host key has changed or is unverified.';
    } else if (rawError.includes('Connection refused') || rawError.includes('Operation timed out') || rawError.includes('No route to host')) {
      friendly = 'Cannot connect to remote server (host offline, port closed, or network unreachable).';
    } else if (rawError.includes('Authentication failed') || rawError.includes('401') || rawError.includes('403')) {
      friendly = 'Authentication failed. Please check your Personal Access Token or credentials.';
    }

    return {
      success: false,
      message: friendly,
      rawError
    };
  }
}

export async function getAuthDiagnostics(): Promise<{
  sshConnected: boolean;
  sshUser: string | null;
  ghCliInstalled: boolean;
  ghCliUser: string | null;
  credentialHelper: string | null;
}> {
  const { exec } = await import('child_process');
  const execPromise = (cmd: string): Promise<{ stdout: string; stderr: string; error?: any }> => {
    return new Promise(resolve => {
      exec(cmd, { timeout: 4000 }, (error, stdout, stderr) => {
        resolve({ stdout: stdout || '', stderr: stderr || '', error });
      });
    });
  };

  // 1. Check SSH to GitHub
  let sshConnected = false;
  let sshUser: string | null = null;
  try {
    const res = await execPromise('ssh -o BatchMode=yes -o ConnectTimeout=4 -T git@github.com');
    const combined = res.stdout + ' ' + res.stderr;
    if (combined.includes('successfully authenticated')) {
      sshConnected = true;
      const match = combined.match(/Hi\s+([a-zA-Z0-9_-]+)!/);
      if (match) sshUser = match[1];
    }
  } catch {}

  // 2. Check GitHub CLI
  let ghCliInstalled = false;
  let ghCliUser: string | null = null;
  try {
    const res = await execPromise('/opt/homebrew/bin/gh auth status || gh auth status');
    ghCliInstalled = !res.error || res.stdout.includes('github.com') || res.stderr.includes('github.com');
    const combined = res.stdout + ' ' + res.stderr;
    const match = combined.match(/account\s+([a-zA-Z0-9_-]+)/i) || combined.match(/Logged in to [^ ]+ account ([a-zA-Z0-9_-]+)/i);
    if (match) ghCliUser = match[1];
  } catch {}

  // 3. Credential helper
  let credentialHelper: string | null = null;
  try {
    const res = await execPromise('git config --global credential.helper');
    credentialHelper = res.stdout.trim() || null;
  } catch {}

  return {
    sshConnected,
    sshUser,
    ghCliInstalled,
    ghCliUser,
    credentialHelper
  };
}
