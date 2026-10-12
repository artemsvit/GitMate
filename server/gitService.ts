import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isIP } from 'node:net';
import { validateFilePath } from './security';
const runFile = promisify(execFile);

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
  isUnstaged: boolean;
  originalPath?: string;
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

export function getGitSshKeyPath(): string | null {
  try {
    const home = os.homedir();
    const edKey = path.join(home, '.ssh', 'gitler_ed25519');
    if (fs.existsSync(edKey)) return edKey;
    const rsaKey = path.join(home, '.ssh', 'gitler_rsa');
    if (fs.existsSync(rsaKey)) return rsaKey;
  } catch {}
  return null;
}

export function getGitSshCommand(): string {
  try {
    const keyPath = getGitSshKeyPath();
    if (keyPath) {
      return `ssh -i '${keyPath.replace(/'/g, "'\\''")}' -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15`;
    }
  } catch {}
  return 'ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15';
}

export function getGit(repoPath: string): SimpleGit {
  // The SSH command is assembled here from a fixed command and a shell-quoted local path.
  return simpleGit({
    baseDir: repoPath,
    maxConcurrentProcesses: 4,
    unsafe: { allowUnsafeSshCommand: true },
    allowEnvironment: ['GIT_SSH_COMMAND']
  }).env({
    PATH: process.env.PATH,
    HOME: os.homedir(),
    TMPDIR: process.env.TMPDIR,
    SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK,
    LANG: process.env.LANG,
    GIT_SSH_COMMAND: getGitSshCommand()
  });
}

function statusFiles(status: StatusResult): FileChange[] {
  return status.files.map(file => ({
    path: file.path,
    originalPath: file.from,
    indexStatus: file.index,
    workingDirStatus: file.working_dir,
    isStaged: file.index !== ' ' && file.index !== '?' && !status.conflicted.includes(file.path),
    isUnstaged: file.working_dir !== ' ' || file.index === '?'
  }));
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

    const files = statusFiles(status);
    const stagedCount = files.filter(f => f.isStaged).length;
    const unstagedCount = files.filter(f => f.isUnstaged).length;

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

  const files = statusFiles(status);

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
    files,
    branches: {
      all: branchSummary.all,
      current: branchSummary.current || summary.currentBranch,
      local: localBranches,
      remote: remoteBranches
    },
    recentCommits
  };
}

const PREVIEW_LIMIT = 256 * 1024;

async function untrackedPreview(repoPath: string, filepath: string): Promise<string> {
  validateFilePath(repoPath, filepath);
  const fullPath = path.join(repoPath, filepath);
  const stat = await fs.promises.lstat(fullPath);
  const header = `diff --git a/${filepath} b/${filepath}\nnew file mode ${stat.isSymbolicLink() ? '120000' : '100644'}\n--- /dev/null\n+++ b/${filepath}\n`;
  if (stat.isSymbolicLink()) {
    return header + `@@ -0,0 +1 @@\n+${await fs.promises.readlink(fullPath)}\n`;
  }
  // Resolve parents too, so a symlinked directory cannot expose files outside the repository.
  const canonical = await fs.promises.realpath(fullPath);
  validateFilePath(repoPath, path.relative(await fs.promises.realpath(repoPath), canonical));
  if (!stat.isFile()) return header + 'Preview unavailable for this file type.\n';
  const handle = await fs.promises.open(canonical, 'r');
  let content: Buffer;
  try {
    const buffer = Buffer.alloc(PREVIEW_LIMIT + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    content = buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
  if (content.includes(0)) return header + 'Binary file: preview unavailable.\n';
  if (content.length > PREVIEW_LIMIT) return header + 'File exceeds the 256 KiB preview limit.\n';
  const text = content.toString('utf8');
  const lines = text ? text.replace(/\n$/, '').split('\n') : [];
  return header + `@@ -0,0 +1,${lines.length} @@\n` + lines.map(line => `+${line}\n`).join('') +
    (text && !text.endsWith('\n') ? '\\ No newline at end of file\n' : '');
}

export async function getDiff(repoPath: string, filepath?: string, staged?: boolean): Promise<string> {
  const git = getGit(repoPath);
  if (filepath) validateFilePath(repoPath, filepath);
  if (!staged && filepath) {
    const status = await git.status();
    if (status.not_added.includes(filepath)) return untrackedPreview(repoPath, filepath);
  }
  return git.raw(['--literal-pathspecs', 'diff', ...(staged ? ['--staged'] : []), '--', ...(filepath ? [filepath] : [])]);
}

function validatedFiles(repoPath: string, files?: string[]): string[] {
  if (files !== undefined && (!Array.isArray(files) || files.length > 10000)) throw new Error('files must be a list of paths.');
  return (files?.length ? files : ['.']).map(file => validateFilePath(repoPath, file));
}

export async function stageFiles(repoPath: string, files?: string[]): Promise<void> {
  await getGit(repoPath).raw(['--literal-pathspecs', 'add', '--', ...validatedFiles(repoPath, files)]);
}

export async function unstageFiles(repoPath: string, files?: string[]): Promise<void> {
  const git = getGit(repoPath);
  const selected = validatedFiles(repoPath, files);
  let hasHead = true;
  try { await git.raw(['rev-parse', '--verify', 'HEAD']); } catch { hasHead = false; }
  if (hasHead) await git.raw(['--literal-pathspecs', 'reset', 'HEAD', '--', ...selected]);
  else await git.raw(['--literal-pathspecs', 'rm', '--cached', '-r', '--ignore-unmatch', '--', ...selected]);
}

function validateArgument(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value || value.startsWith('-') || /[\0\r\n]/.test(value)) {
    throw new Error(`Invalid ${name}.`);
  }
}

export async function commit(repoPath: string, message: string): Promise<string> {
  const git = getGit(repoPath);
  if (typeof message !== 'string' || !message.trim() || message.includes('\0')) throw new Error('A commit message is required.');
  const result = await git.commit(message);
  return result.commit;
}

function formatRemoteError(err: any, remoteName?: string): Error {
  const msg = err?.message || String(err);
  if (/No route to host|Network is unreachable/i.test(msg)) {
    return new Error(`Network unreachable: Cannot route to host${remoteName ? ` for "${remoteName}"` : ''}. Check your Wi-Fi, local network, VPN, or verify that the server is online.`);
  }
  if (/Connection refused/i.test(msg)) {
    return new Error(`Connection refused: Host is reachable, but the Git port is not listening${remoteName ? ` on "${remoteName}"` : ''}.`);
  }
  if (/Could not resolve host/i.test(msg)) {
    return new Error(`Host not found: DNS failed to resolve server hostname${remoteName ? ` for "${remoteName}"` : ''}. Check your network or URL.`);
  }
  if (/Operation timed out|Connection timed out/i.test(msg)) {
    return new Error(`Connection timed out: The remote server did not respond${remoteName ? ` for "${remoteName}"` : ''}.`);
  }
  if (/Permission denied \(publickey\)/i.test(msg)) {
    return new Error(`SSH authentication failed${remoteName ? ` for "${remoteName}"` : ''}. The remote server rejected your SSH key.`);
  }
  if (/Authentication failed|HTTP 401|HTTP 403/i.test(msg)) {
    return new Error(`Authentication failed${remoteName ? ` for "${remoteName}"` : ''}. Check your Personal Access Token or credentials.`);
  }
  return new Error(msg);
}

export async function push(repoPath: string, remote?: string, branch?: string): Promise<string> {
  if (remote !== undefined) validateArgument(remote, 'remote');
  if (branch !== undefined) validateArgument(branch, 'branch');
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
    throw formatRemoteError(err, targetRemote);
  }
}

export async function pull(repoPath: string, remote?: string, branch?: string): Promise<string> {
  if (remote !== undefined) validateArgument(remote, 'remote');
  if (branch !== undefined) validateArgument(branch, 'branch');
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
    if (msg.includes('no tracking information') || msg.includes('Please specify which branch')) {
      try {
        const fallbackRes = await git.pull(targetRemote, currentBranch);
        const changes = fallbackRes?.summary?.changes ?? 0;
        return `Pulled from ${targetRemote}/${currentBranch} (${changes} changes)`;
      } catch (fallbackErr: any) {
        throw new Error(`No tracking information found for branch "${currentBranch}". Run "git branch --set-upstream-to=${targetRemote}/${currentBranch}".`);
      }
    }
    throw formatRemoteError(err, targetRemote);
  }
}

export async function fetchAll(repoPath: string): Promise<string> {
  const git = getGit(repoPath);
  const remotes = await git.getRemotes(true);
  if (!remotes || remotes.length === 0) {
    return 'No remotes configured.';
  }

  if (remotes.length === 1) {
    try {
      await git.fetch(remotes[0].name);
      return `Fetched ${remotes[0].name}`;
    } catch (err: any) {
      throw formatRemoteError(err, remotes[0].name);
    }
  }

  const succeeded: string[] = [];
  const failed: { name: string; message: string }[] = [];

  for (const r of remotes) {
    try {
      await git.fetch(r.name);
      succeeded.push(r.name);
    } catch (err: any) {
      const formatted = formatRemoteError(err, r.name);
      failed.push({ name: r.name, message: formatted.message });
    }
  }

  if (failed.length === remotes.length) {
    throw new Error(`Failed to fetch remotes:\n${failed.map(f => `${f.name}: ${f.message}`).join('\n')}`);
  }

  if (failed.length > 0) {
    return `Fetched ${succeeded.join(', ')} (Unreachable: ${failed.map(f => f.name).join(', ')})`;
  }

  return `Fetched ${succeeded.join(', ')}`;
}

export async function checkout(repoPath: string, branchName: string, createNew = false): Promise<string> {
  validateArgument(branchName, 'branch');
  if (typeof createNew !== 'boolean') throw new Error('createNew must be a boolean.');
  const git = getGit(repoPath);
  if (createNew) {
    await git.checkoutLocalBranch(branchName);
  } else {
    await git.checkout(branchName);
  }
  return `Switched to ${branchName}`;
}

export async function setRemoteUrl(repoPath: string, remoteName: string, newUrl: string): Promise<string> {
  validateArgument(remoteName, 'remote');
  validateArgument(newUrl, 'remote URL');
  const git = getGit(repoPath);
  await git.remote(['set-url', remoteName, newUrl]);
  return `Updated remote "${remoteName}" to ${newUrl}`;
}

export async function getOrCreateGitlerSshKey(
  regenerate = false,
  keyType: 'ed25519' | 'rsa' = 'ed25519'
): Promise<{
  hasKey: boolean;
  publicKey: string;
  keyPath: string;
  keyType: 'ed25519' | 'rsa';
}> {
  const home = os.homedir();
  const sshDir = path.join(home, '.ssh');
  const edPath = path.join(sshDir, 'gitler_ed25519');
  const rsaPath = path.join(sshDir, 'gitler_rsa');

  if (!fs.existsSync(sshDir)) {
    try {
      fs.mkdirSync(sshDir, { mode: 0o700, recursive: true });
    } catch {}
  }

  if (regenerate) {
    try {
      if (fs.existsSync(edPath)) fs.unlinkSync(edPath);
      if (fs.existsSync(`${edPath}.pub`)) fs.unlinkSync(`${edPath}.pub`);
      if (fs.existsSync(rsaPath)) fs.unlinkSync(rsaPath);
      if (fs.existsSync(`${rsaPath}.pub`)) fs.unlinkSync(`${rsaPath}.pub`);
    } catch {}
  } else {
    // Look for existing key
    const candidates = [
      { path: edPath, type: 'ed25519' as const },
      { path: rsaPath, type: 'rsa' as const }
    ];
    for (const c of candidates) {
      const pubPath = `${c.path}.pub`;
      if (fs.existsSync(pubPath)) {
        try {
          const content = fs.readFileSync(pubPath, 'utf8').trim();
          if (content) {
            return { hasKey: true, publicKey: content, keyPath: c.path, keyType: c.type };
          }
        } catch {}
      }
    }
  }

  const selectedPath = keyType === 'rsa' ? rsaPath : edPath;
  const selectedPub = `${selectedPath}.pub`;
  const keygenArgs = keyType === 'rsa'
    ? ['-t', 'rsa', '-b', '4096', '-N', '', '-C', 'gitler-app', '-f', selectedPath]
    : ['-t', 'ed25519', '-N', '', '-C', 'gitler-app', '-f', selectedPath];

  await new Promise<void>((resolve, reject) => {
    execFile('ssh-keygen', keygenArgs, (err) => {
      if (err) return reject(err);
      try {
        fs.chmodSync(selectedPath, 0o600);
        fs.chmodSync(selectedPub, 0o644);
      } catch {}
      resolve();
    });
  });

  const content = fs.readFileSync(selectedPub, 'utf8').trim();
  return { hasKey: true, publicKey: content, keyPath: selectedPath, keyType };
}

export async function testRemoteConnection(repoPath: string, remoteName = 'origin'): Promise<{
  success: boolean;
  message: string;
  rawError?: string;
  detectedProvider?: string;
}> {
  validateArgument(remoteName, 'remote');
  const git = getGit(repoPath);
  try {
    const remotes = await git.getRemotes(true);
    const target = remotes.find(r => r.name === remoteName) || remotes[0];
    if (!target) {
      return { success: false, message: 'No remote configured for this repository.' };
    }

    // ls-remote checks the fetch URL; the push URL may be a different provider.
    const remoteUrl = target.refs.fetch || target.refs.push || '';
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
      message: `Connected to "${target.name}" (${detectedProvider.toUpperCase()}) successfully. Repository read access verified.`,
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
  const read = async (key: string) => {
    try { return (await runFile('git', ['config', '--global', '--get', key])).stdout.trim(); }
    catch { return ''; }
  };
  const [userName, userEmail, defaultBranch] = await Promise.all([
    read('user.name'), read('user.email'), read('init.defaultBranch')
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
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid Git identity settings.');
  const fields = { userName: 'user.name', userEmail: 'user.email', defaultBranch: 'init.defaultBranch' } as const;
  for (const [field, key] of Object.entries(fields)) {
    const value = config[field as keyof typeof fields];
    if (value !== undefined) {
      if (typeof value !== 'string' || /[\0\r\n]/.test(value) || value.length > 1024) throw new Error(`Invalid ${field}.`);
      await runFile('git', ['config', '--global', '--', key, value]);
    }
  }
}

export async function testHostSsh(host: string, port = 22): Promise<{
  success: boolean;
  authenticated: boolean;
  provider: string;
  message: string;
  raw: string;
}> {
  if (typeof host !== 'string' || host.length > 253 ||
      (!isIP(host) && !/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host)) ||
      !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SSH host or port.');
  const keyPath = getGitSshKeyPath();
  const args = [...(keyPath ? ['-i', keyPath] : []), '-p', String(port),
    '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-T', `git@${host}`];
  return new Promise(resolve => {
    execFile('ssh', args, { timeout: 6000 }, (_err, stdout, stderr) => {
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

