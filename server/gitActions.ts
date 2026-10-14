import fs from 'node:fs';
import path from 'node:path';
import { getGit, validateArgument, withRepositoryMutation } from './gitService';
import { validateFilePath } from './security';
import { listWorktrees } from './worktreeService';

const hashPattern = /^[0-9a-f]{7,40}$/i;
const stashPattern = /^stash@\{\d+\}$/;
const validHash = (value: unknown) => { if (typeof value !== 'string' || !hashPattern.test(value)) throw new Error('Invalid commit identifier.'); return value; };
const validStash = (value: unknown) => { if (typeof value !== 'string' || !stashPattern.test(value)) throw new Error('Invalid stash.'); return value; };
async function validName(repoPath: string, value: unknown, kind: 'branch' | 'tag') {
  validateArgument(value, kind);
  if (kind === 'branch') await getGit(repoPath).raw(['check-ref-format', '--branch', value]);
  else await getGit(repoPath).raw(['check-ref-format', `refs/tags/${value}`]);
  return value;
}
// Which operation is waiting for conflicts to be resolved, if any.
export function pendingOperation(repoPath: string): 'merge' | 'cherry-pick' | 'revert' | null {
  const gitDir = (() => { const dot = path.join(repoPath, '.git'); if (fs.statSync(dot).isDirectory()) return dot; const line = fs.readFileSync(dot, 'utf8').match(/^gitdir:\s*(.+)$/m)?.[1]; return line ? path.resolve(repoPath, line.trim()) : dot; })();
  if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) return 'merge';
  if (fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick';
  if (fs.existsSync(path.join(gitDir, 'REVERT_HEAD'))) return 'revert';
  return null;
}
// Runs an operation that can stop on conflicts and reports them instead of failing silently.
// Git reports conflicts on standard output, so simple-git may not throw; the pending state is checked either way.
async function withConflicts(repoPath: string, label: string, run: () => Promise<unknown>) {
  let failure: unknown = null;
  try { await run(); } catch (error) { failure = error; }
  const pending = pendingOperation(repoPath);
  if (pending) return { ok: false, conflict: pending, message: `${label} stopped on conflicts. Resolve the files and commit, or abort.` };
  if (failure) throw failure;
  return { ok: true, message: `${label} completed.` };
}

// --- Discard ---------------------------------------------------------------------------------------------------
async function discardUnlocked(repoPath: string, files: unknown) {
  const git = getGit(repoPath); const status = await git.status();
  const all = files === 'all';
  if (!all && (!Array.isArray(files) || !files.length || files.length > 2000)) throw new Error('Choose files to discard.');
  const targets = all ? status.files.map(file => file.path) : (files as unknown[]).map(file => validateFilePath(repoPath, file));
  const byPath = new Map(status.files.map(file => [file.path, file]));
  const tracked = targets.filter(file => byPath.get(file) && byPath.get(file)!.index !== '?' && byPath.get(file)!.index !== 'A');
  const added = targets.filter(file => byPath.get(file)?.index === 'A');
  const untracked = targets.filter(file => byPath.get(file)?.index === '?');
  // A backup stash keeps the discarded tracked changes recoverable from the stash list.
  let backup = '';
  if (tracked.length || added.length) {
    backup = (await git.raw(['stash', 'create'])).trim();
    if (backup) await git.raw(['stash', 'store', '-m', 'Git Mate discard backup', backup]);
  }
  if (tracked.length) await git.raw(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked]);
  if (added.length) { await git.raw(['rm', '--cached', '--quiet', '--', ...added]); await git.raw(['clean', '-f', '-q', '--', ...added]); }
  if (untracked.length) await git.raw(['clean', '-f', '-q', '--', ...untracked]);
  return { discarded: targets.length, backup: Boolean(backup) };
}

// --- Commit amend ----------------------------------------------------------------------------------------------
async function amendUnlocked(repoPath: string, message: unknown, allowPublished: unknown) {
  if (typeof message !== 'string' || !message.trim() || message.includes('\0')) throw new Error('Enter a commit message.');
  const git = getGit(repoPath);
  const published = (await git.raw(['branch', '-r', '--contains', 'HEAD'])).trim();
  if (published && allowPublished !== true) return { ok: false, needsConfirmation: true, message: 'The last commit is already on a remote. Amending rewrites it, and the next push must be forced.' };
  await git.commit(message, undefined, { '--amend': null });
  return { ok: true, message: 'Last commit amended.' };
}

// --- Stash -----------------------------------------------------------------------------------------------------
export async function listStashes(repoPath: string) {
  const out = await getGit(repoPath).raw(['stash', 'list', '--format=%gd%x1f%H%x1f%ct%x1f%gs%x1e']);
  return out.split('\x1e').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const [ref, hash, date, subject] = entry.split('\x1f');
    return { ref, hash, date: Number(date), subject: subject.replace(/^(?:WIP on|On) [^:]+: /, '') };
  });
}
async function stashSaveUnlocked(repoPath: string, message: unknown, includeUntracked: unknown) {
  if (message !== undefined && (typeof message !== 'string' || /[\0\r\n]/.test(message) || message.length > 200)) throw new Error('Use a short, single-line stash message.');
  const git = getGit(repoPath);
  const before = (await listStashes(repoPath)).length;
  await git.raw(['stash', 'push', ...(includeUntracked === true ? ['--include-untracked'] : []), ...(message ? ['-m', message as string] : [])]);
  if ((await listStashes(repoPath)).length === before) throw new Error('There are no changes to stash.');
  return { ok: true, message: 'Changes stashed.' };
}
async function stashActionUnlocked(repoPath: string, action: unknown, ref: unknown) {
  validStash(ref);
  if (!['apply', 'pop', 'drop'].includes(action as string)) throw new Error('Unknown stash action.');
  const git = getGit(repoPath);
  if (action === 'drop') { await git.raw(['stash', 'drop', ref as string]); return { ok: true, message: 'Stash deleted.' }; }
  let failure: unknown = null;
  try { await git.raw(['stash', action as string, ref as string]); } catch (error) { failure = error; }
  // Conflicts may not raise an error; a conflicting pop keeps the stash, as Git does.
  if ((await git.status()).conflicted.length) return { ok: false, conflict: 'stash', message: 'The stash was applied with conflicts. Resolve the files; the stash was kept.' };
  if (failure) throw failure;
  return { ok: true, message: action === 'pop' ? 'Stash applied and removed.' : 'Stash applied.' };
}

// --- Commit actions (Graph) -------------------------------------------------------------------------------------
async function commitActionUnlocked(repoPath: string, action: unknown, hash: unknown, name?: unknown) {
  const git = getGit(repoPath); validHash(hash);
  const commit = (await git.raw(['rev-parse', '--verify', '--end-of-options', `${hash}^{commit}`])).trim();
  switch (action) {
    case 'checkout': await git.raw(['checkout', '--detach', commit]); return { ok: true, message: `Checked out ${commit.slice(0, 7)} without a branch.` };
    case 'branch': await validName(repoPath, name, 'branch'); await git.raw(['branch', '--', name as string, commit]); return { ok: true, message: `Created branch ${name}.` };
    case 'branch-checkout': await validName(repoPath, name, 'branch'); await git.raw(['checkout', '-b', name as string, commit]); return { ok: true, message: `Created and switched to ${name}.` };
    case 'tag': await validName(repoPath, name, 'tag'); await git.raw(['tag', '--', name as string, commit]); return { ok: true, message: `Created tag ${name}.` };
    case 'cherry-pick': {
      const merge = (await git.raw(['rev-list', '--parents', '-n', '1', commit])).trim().split(' ').length > 2;
      return withConflicts(repoPath, 'Cherry-pick', () => git.raw(['cherry-pick', ...(merge ? ['-m', '1'] : []), commit]));
    }
    case 'revert': {
      const merge = (await git.raw(['rev-list', '--parents', '-n', '1', commit])).trim().split(' ').length > 2;
      return withConflicts(repoPath, 'Revert', () => git.raw(['revert', '--no-edit', ...(merge ? ['-m', '1'] : []), commit]));
    }
    default: throw new Error('Unknown commit action.');
  }
}

// --- Branches and tags -------------------------------------------------------------------------------------------
async function mergeUnlocked(repoPath: string, branch: unknown) {
  validateArgument(branch, 'branch');
  const git = getGit(repoPath);
  const refs = (await git.raw(['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'])).split('\n');
  if (!refs.includes(branch)) throw new Error('Unknown branch.');
  return withConflicts(repoPath, `Merge of ${branch}`, () => git.raw(['merge', '--no-edit', '--end-of-options', branch]));
}
async function deleteBranchUnlocked(repoPath: string, branch: unknown, force: unknown) {
  validateArgument(branch, 'branch');
  const git = getGit(repoPath);
  if ((await git.raw(['branch', '--show-current'])).trim() === branch) throw new Error('Switch to another branch before deleting this one.');
  const owner = (await listWorktrees(repoPath)).find(entry => entry.branch === branch);
  if (owner) throw new Error(`This branch is checked out in the worktree at ${owner.path}.`);
  try { await git.raw(['branch', force === true ? '-D' : '-d', '--', branch]); return { ok: true, message: `Deleted branch ${branch}.` }; }
  catch (error: any) {
    if (/not fully merged/i.test(error.message)) return { ok: false, needsConfirmation: true, message: `${branch} has commits that are not merged. Deleting it can lose them.` };
    throw error;
  }
}
async function deleteTagUnlocked(repoPath: string, tag: unknown) {
  validateArgument(tag, 'tag');
  await getGit(repoPath).raw(['tag', '-d', '--', tag]); return { ok: true, message: `Deleted tag ${tag}.` };
}
async function abortUnlocked(repoPath: string) {
  const pending = pendingOperation(repoPath);
  if (!pending) throw new Error('No merge, cherry-pick, or revert is in progress.');
  await getGit(repoPath).raw([pending, '--abort']);
  return { ok: true, message: `The ${pending} was aborted.` };
}

const locked = <A extends unknown[], R>(run: (repoPath: string, ...args: A) => Promise<R>) => (repoPath: string, ...args: A) => withRepositoryMutation(repoPath, () => run(repoPath, ...args));
export const discardChanges = locked(discardUnlocked);
export const amendCommit = locked(amendUnlocked);
export const saveStash = locked(stashSaveUnlocked);
export const stashAction = locked(stashActionUnlocked);
export const commitAction = locked(commitActionUnlocked);
export const mergeBranch = locked(mergeUnlocked);
export const deleteBranch = locked(deleteBranchUnlocked);
export const deleteTag = locked(deleteTagUnlocked);
export const abortOperation = locked(abortUnlocked);
