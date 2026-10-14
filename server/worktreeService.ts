import fs from 'node:fs';
import path from 'node:path';
import { getGit, validateArgument, withRepositoryMutation } from './gitService';

export interface Worktree {
  path: string; head: string | null; branch: string | null; detached: boolean; bare: boolean;
  locked: string | null; prunable: string | null; main: boolean;
}

// Parses `git worktree list --porcelain -z`: NUL-terminated "label value" fields, records ended by an empty field.
// The first record is always the main worktree. "locked"/"prunable" without a reason mean an empty reason.
export function parseWorktrees(output: string): Worktree[] {
  const records: Worktree[] = []; let current: Worktree | null = null;
  for (const field of output.split('\0')) {
    if (!field) { if (current) records.push(current); current = null; continue; }
    const space = field.indexOf(' '); const label = space === -1 ? field : field.slice(0, space); const value = space === -1 ? '' : field.slice(space + 1);
    if (label === 'worktree') { current = { path: value, head: null, branch: null, detached: false, bare: false, locked: null, prunable: null, main: records.length === 0 }; continue; }
    if (!current) continue;
    if (label === 'HEAD') current.head = value;
    else if (label === 'branch') current.branch = value.replace(/^refs\/heads\//, '');
    else if (label === 'detached') current.detached = true;
    else if (label === 'bare') current.bare = true;
    else if (label === 'locked') current.locked = value;
    else if (label === 'prunable') current.prunable = value;
  }
  if (current) records.push(current);
  return records;
}

export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  return parseWorktrees(await getGit(repoPath).raw(['worktree', 'list', '--porcelain', '-z']));
}

const real = (target: string) => { try { return fs.realpathSync(target); } catch { return path.resolve(target); } };
// Finds a linked worktree by path among this repository's worktrees; the main worktree is never a target.
async function linkedWorktree(repoPath: string, target: unknown) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) throw new Error('A worktree path is required.');
  const match = (await listWorktrees(repoPath)).find(entry => real(entry.path) === real(target));
  if (!match) throw new Error('That folder is not a worktree of this repository.');
  if (match.main) throw new Error('The main worktree cannot be changed here.');
  return match;
}

async function createWorktreeUnlocked(repoPath: string, options: { path: unknown; branch: unknown; newBranch?: unknown; base?: unknown }) {
  if (typeof options.path !== 'string' || !path.isAbsolute(options.path)) throw new Error('Choose an absolute folder path for the worktree.');
  const target = path.resolve(options.path);
  if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error('That folder already exists and is not empty.');
  const mainPath = real((await listWorktrees(repoPath))[0].path);
  if (target === mainPath || target.startsWith(mainPath + path.sep)) throw new Error('Choose a folder outside the repository, for example next to it.');
  const git = getGit(repoPath);
  const args = ['worktree', 'add'];
  if (options.newBranch === true) {
    validateArgument(options.branch, 'branch');
    await git.raw(['check-ref-format', '--branch', options.branch as string]);
    args.push('-b', options.branch as string, '--', target);
    if (options.base !== undefined && options.base !== '') { validateArgument(options.base, 'base'); args.push(options.base as string); }
  } else {
    validateArgument(options.branch, 'branch');
    args.push('--', target, options.branch as string);
  }
  await git.raw(args);
  return real(target);
}

async function removeWorktreeUnlocked(repoPath: string, target: unknown, force = false) {
  const entry = await linkedWorktree(repoPath, target);
  if (entry.locked !== null) throw new Error(`This worktree is locked${entry.locked ? ` (${entry.locked})` : ''}. Unlock it first.`);
  // The branch stays; only the folder and Git's record of it are removed.
  await getGit(repoPath).raw(['worktree', 'remove', ...(force === true ? ['--force'] : []), entry.path]);
  return entry.path;
}

async function lockWorktreeUnlocked(repoPath: string, target: unknown, locked: boolean, reason?: unknown) {
  const entry = await linkedWorktree(repoPath, target);
  if (reason !== undefined && (typeof reason !== 'string' || /[\0\r\n]/.test(reason) || reason.length > 200)) throw new Error('Use a short, single-line reason.');
  await getGit(repoPath).raw(locked ? ['worktree', 'lock', ...(reason ? ['--reason', reason as string] : []), entry.path] : ['worktree', 'unlock', entry.path]);
}

async function pruneWorktreesUnlocked(repoPath: string) {
  const stale = (await listWorktrees(repoPath)).filter(entry => entry.prunable !== null && entry.locked === null).map(entry => entry.path);
  await getGit(repoPath).raw(['worktree', 'prune']);
  return stale;
}

export const createWorktree = (repoPath: string, options: Parameters<typeof createWorktreeUnlocked>[1]) => withRepositoryMutation(repoPath, () => createWorktreeUnlocked(repoPath, options));
export const removeWorktree = (repoPath: string, target: unknown, force = false) => withRepositoryMutation(repoPath, () => removeWorktreeUnlocked(repoPath, target, force));
export const lockWorktree = (repoPath: string, target: unknown, locked: boolean, reason?: unknown) => withRepositoryMutation(repoPath, () => lockWorktreeUnlocked(repoPath, target, locked, reason));
export const pruneWorktrees = (repoPath: string) => withRepositoryMutation(repoPath, () => pruneWorktreesUnlocked(repoPath));
