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

export function getGitSshCommand(): string {
  try {
    const home = os.homedir();
    const keyPath = path.join(home, '.ssh', 'gitler_ed25519');
    if (fs.existsSync(keyPath)) {
      return `ssh -i "${keyPath}" -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15`;
    }
  } catch {}
  return 'ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15';
}

export function getGit(repoPath: string): SimpleGit {
  cleanStaleIndexLock(repoPath);
  return simpleGit({
    baseDir: repoPath,
    maxConcurrentProcesses: 4,
    spawnOptions: {
      env: {
        ...process.env,
        GIT_SSH_COMMAND: getGitSshCommand()
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

export async function getOrCreateGitlerSshKey(regenerate = false): Promise<{
  hasKey: boolean;
  publicKey: string;
  keyPath: string;
}> {
  const home = os.homedir();
  const sshDir = path.join(home, '.ssh');
  const keyPath = path.join(sshDir, 'gitler_ed25519');
  const pubPath = `${keyPath}.pub`;

  if (!fs.existsSync(sshDir)) {
    try {
      fs.mkdirSync(sshDir, { mode: 0o700, recursive: true });
    } catch {}
  }

  if (regenerate) {
    try {
      if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
      if (fs.existsSync(pubPath)) fs.unlinkSync(pubPath);
    } catch {}
  }

  if (fs.existsSync(pubPath)) {
    try {
      const content = fs.readFileSync(pubPath, 'utf8').trim();
      if (content) {
        return { hasKey: true, publicKey: content, keyPath };
      }
    } catch {}
  }

  const { exec } = await import('child_process');
  await new Promise<void>((resolve, reject) => {
    exec(`ssh-keygen -t ed25519 -N "" -C "gitler-app" -f "${keyPath}"`, (err) => {
      if (err) return reject(err);
      try {
        fs.chmodSync(keyPath, 0o600);
        fs.chmodSync(pubPath, 0o644);
      } catch {}
      resolve();
    });
  });

  const content = fs.readFileSync(pubPath, 'utf8').trim();
  return { hasKey: true, publicKey: content, keyPath };
}

export async function testRemoteConnection(repoPath: string, remoteName = 'origin'): Promise<{
  success: boolean;
  message: string;
  rawError?: string;
  detectedProvider?: string;
}> {
  const git = getGit(repoPath);
  try {
    const remotes = await git.getRemotes(true);
    const target = remotes.find(r => r.name === remoteName) || remotes[0];
    if (!target) {
      return { success: false, message: 'No remote configured for this repository.' };
    }

    const remoteUrl = (target as any).refs?.push || (target as any).refs?.fetch || target.pushUrl || target.fetchUrl || '';
    let detectedProvider = 'generic';
    if (remoteUrl.includes('github.com')) {
      detectedProvider = 'github';
    } else if (remoteUrl.includes('gitlab.com')) {
      detectedProvider = 'gitlab';
    } else if (remoteUrl.toLowerCase().includes('gitea') || remoteUrl.includes(':222') || remoteUrl.includes(':3000') || remoteUrl.includes('192.168.')) {
      detectedProvider = 'gitea';
    }

    await git.listRemote([target.name]);
    return {
      success: true,
      message: `Connected to "${target.name}" (${detectedProvider.toUpperCase()}) successfully! SSH authorization verified.`,
      detectedProvider
    };
  } catch (err: any) {
    const rawError = err.message || String(err);
    let friendly = rawError;

    if (rawError.includes('Permission denied') || rawError.includes('publickey')) {
      friendly = 'SSH key rejected by server. Please verify the Gitler public key is added to your Gitea account (Settings → SSH / GPG Keys → Add Key).';
    } else if (rawError.includes('Host key verification failed')) {
      friendly = 'Host key verification failed. The remote server host key has changed or is unverified.';
    } else if (rawError.includes('No route to host')) {
      friendly = 'No route to host: Cannot reach the remote server (server temporarily offline or local network reconnected). Please verify connectivity and click Test Connection again.';
    } else if (rawError.includes('Connection refused') || rawError.includes('Operation timed out')) {
      friendly = 'Cannot connect to remote server: Port closed or network timed out.';
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

export async function getGlobalGitConfig(): Promise<{
  userName: string;
  userEmail: string;
  defaultBranch: string;
}> {
  const { exec } = await import('child_process');
  const execCmd = (cmd: string): Promise<string> =>
    new Promise(res => exec(cmd, (_e, stdout) => res((stdout || '').trim())));

  const [userName, userEmail, defaultBranch] = await Promise.all([
    execCmd('git config --global user.name'),
    execCmd('git config --global user.email'),
    execCmd('git config --global init.defaultBranch')
  ]);

  return {
    userName,
    userEmail,
    defaultBranch: defaultBranch || 'main'
  };
}

export async function updateGlobalGitConfig(config: {
  userName?: string;
  userEmail?: string;
  defaultBranch?: string;
}): Promise<void> {
  const { exec } = await import('child_process');
  const execCmd = (cmd: string): Promise<void> =>
    new Promise((resolve, reject) => exec(cmd, err => (err ? reject(err) : resolve())));

  if (config.userName !== undefined) {
    await execCmd(`git config --global user.name "${config.userName.replace(/"/g, '\\"')}"`);
  }
  if (config.userEmail !== undefined) {
    await execCmd(`git config --global user.email "${config.userEmail.replace(/"/g, '\\"')}"`);
  }
  if (config.defaultBranch !== undefined) {
    await execCmd(`git config --global init.defaultBranch "${config.defaultBranch.replace(/"/g, '\\"')}"`);
  }
}

export async function testHostSsh(host: string, port = 22): Promise<{
  success: boolean;
  authenticated: boolean;
  provider: string;
  message: string;
  raw: string;
}> {
  const { exec } = await import('child_process');
  const keyPath = path.join(os.homedir(), '.ssh', 'gitler_ed25519');
  const keyFlag = fs.existsSync(keyPath) ? `-i "${keyPath}" ` : '';
  const cmd = `ssh ${keyFlag}-p ${port} -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=5 -T git@${host}`;

  return new Promise(resolve => {
    exec(cmd, { timeout: 6000 }, (_err, stdout, stderr) => {
      const raw = ((stdout || '') + ' ' + (stderr || '')).trim();
      let provider = 'generic';
      if (host.includes('github.com')) provider = 'github';
      else if (host.includes('gitlab.com')) provider = 'gitlab';
      else if (raw.toLowerCase().includes('gitea') || host.includes(':222') || port === 222) provider = 'gitea';

      if (raw.includes('successfully authenticated') || raw.includes('Welcome to GitLab') || raw.includes('Hi there')) {
        return resolve({
          success: true,
          authenticated: true,
          provider,
          message: `Authenticated with ${host}:${port}! Access verified.`,
          raw
        });
      }

      if (raw.includes('Permission denied') || raw.includes('publickey')) {
        return resolve({
          success: false,
          authenticated: false,
          provider,
          message: `Connected to ${host}:${port}, but SSH key was not accepted yet. Add the Gitler public key to your ${provider === 'gitea' ? 'Gitea' : 'git host'} account.`,
          raw
        });
      }

      if (raw.includes('Connection refused') || raw.includes('timed out') || raw.includes('No route to host')) {
        return resolve({
          success: false,
          authenticated: false,
          provider,
          message: `Cannot connect to ${host}:${port}. Server unreachable or port closed.`,
          raw
        });
      }

      return resolve({
        success: false,
        authenticated: false,
        provider,
        message: raw || 'SSH probe finished.',
        raw
      });
    });
  });
}

