import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { parseWorktrees, listWorktrees, createWorktree, removeWorktree, lockWorktree, pruneWorktrees } from '../server/worktreeService';
import { discardChanges, amendCommit, saveStash, stashAction, listStashes, commitAction, mergeBranch, deleteBranch, deleteTag, abortOperation, pendingOperation } from '../server/gitActions';
const run = promisify(execFile);

async function makeRepo() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gitmate-actions-')));
  const git = (...args: string[]) => run('git', ['-C', repo, '-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args]);
  await git('init', '-q', '-b', 'main'); await git('config', 'user.name', 'Ada'); await git('config', 'user.email', 'ada@example.com');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n'); await git('add', '.'); await git('commit', '-q', '-m', 'first');
  return { repo, git, out: async (...args: string[]) => (await git(...args)).stdout.trim() };
}

test('worktree list output is parsed, including locked and prunable entries', () => {
  const output = ['worktree /repo', 'HEAD aaa', 'branch refs/heads/main', '', 'worktree /wt/feature', 'HEAD bbb', 'branch refs/heads/feature', 'locked on a USB drive', '', 'worktree /wt/agent', 'HEAD ccc', 'detached', 'prunable gitdir file points to non-existent location', ''].join('\0');
  const list = parseWorktrees(output);
  assert.deepEqual(list.map(entry => [entry.path, entry.main, entry.branch, entry.detached]), [['/repo', true, 'main', false], ['/wt/feature', false, 'feature', false], ['/wt/agent', false, null, true]]);
  assert.equal(list[1].locked, 'on a USB drive'); assert.equal(list[2].prunable, 'gitdir file points to non-existent location'); assert.equal(list[0].locked, null);
});

test('worktrees are created, locked, removed without losing the branch, and pruned', async () => {
  const { repo, out } = await makeRepo();
  const target = path.join(path.dirname(repo), path.basename(repo) + '-feature');
  const created = await createWorktree(repo, { path: target, branch: 'feature', newBranch: true });
  assert.equal(created, fs.realpathSync(target));
  const list = await listWorktrees(repo);
  assert.equal(list.length, 2); assert.equal(list[1].branch, 'feature');
  await assert.rejects(createWorktree(repo, { path: path.join(repo, 'inside'), branch: 'x', newBranch: true }), /outside the repository/);
  await assert.rejects(removeWorktree(repo, repo), /main worktree/);
  await lockWorktree(repo, target, true, 'testing');
  assert.equal((await listWorktrees(repo))[1].locked, 'testing');
  await assert.rejects(removeWorktree(repo, target), /locked/);
  await lockWorktree(repo, target, false);
  fs.writeFileSync(path.join(target, 'a.txt'), 'changed\n');
  await assert.rejects(removeWorktree(repo, target), /modified|untracked|clean|contains/i);
  await removeWorktree(repo, target, true);
  assert.equal(fs.existsSync(target), false);
  assert.match(await out('branch', '--list', 'feature'), /feature/, 'the branch is kept');
  const gone = path.join(path.dirname(repo), path.basename(repo) + '-gone');
  await createWorktree(repo, { path: gone, branch: 'feature' });
  fs.rmSync(gone, { recursive: true, force: true });
  assert.deepEqual(await pruneWorktrees(repo), [gone]);
  assert.equal((await listWorktrees(repo)).length, 1);
});

test('discard keeps a backup stash and handles modified, added, and new files', async () => {
  const { repo, git } = await makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'changed\n');
  fs.writeFileSync(path.join(repo, 'added.txt'), 'added\n'); await git('add', 'added.txt');
  fs.writeFileSync(path.join(repo, 'new.txt'), 'new\n');
  await assert.rejects(discardChanges(repo, ['../outside.txt']), /outside/);
  const result = await discardChanges(repo, 'all');
  assert.equal(result.discarded, 3); assert.equal(result.backup, true);
  assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'one\n');
  assert.equal(fs.existsSync(path.join(repo, 'added.txt')), false); assert.equal(fs.existsSync(path.join(repo, 'new.txt')), false);
  const stashes = await listStashes(repo);
  assert.equal(stashes[0].subject, 'Git Mate discard backup');
  await stashAction(repo, 'apply', stashes[0].ref);
  assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'changed\n', 'the backup restores the discarded change');
});

test('stash save, apply, pop, and drop', async () => {
  const { repo } = await makeRepo();
  await assert.rejects(saveStash(repo, 'nothing', false), /no changes/);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'wip\n'); fs.writeFileSync(path.join(repo, 'new.txt'), 'n\n');
  await saveStash(repo, 'work in progress', true);
  assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'one\n'); assert.equal(fs.existsSync(path.join(repo, 'new.txt')), false);
  const [stash] = await listStashes(repo); assert.equal(stash.subject, 'work in progress');
  await stashAction(repo, 'pop', stash.ref);
  assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'wip\n'); assert.equal((await listStashes(repo)).length, 0);
  await saveStash(repo, 'conflict', false); fs.writeFileSync(path.join(repo, 'a.txt'), 'other\n');
  await run('git', ['-C', repo, '-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', 'commit', '-q', '-am', 'other']);
  const conflicted = await stashAction(repo, 'pop', 'stash@{0}');
  assert.equal(conflicted.ok, false); assert.equal((conflicted as any).conflict, 'stash'); assert.equal((await listStashes(repo)).length, 1, 'a conflicting pop keeps the stash');
  await run('git', ['-C', repo, 'checkout', '-q', '--', '.']).catch(() => {}); await run('git', ['-C', repo, 'reset', '-q', '--hard']);
  await stashAction(repo, 'drop', 'stash@{0}');
  assert.equal((await listStashes(repo)).length, 0);
  await assert.rejects(stashAction(repo, 'drop', 'stash@{0}; rm'), /Invalid stash/);
});

test('amend asks before rewriting a published commit', async () => {
  const { repo, git, out } = await makeRepo();
  fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n'); await git('add', 'b.txt');
  assert.equal((await amendCommit(repo, 'first, with b', false)).ok, true);
  assert.equal(await out('log', '-1', '--format=%s'), 'first, with b'); assert.match(await out('show', '--name-only', '--format='), /b\.txt/);
  await git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const asked = await amendCommit(repo, 'again', false);
  assert.equal(asked.ok, false); assert.equal(asked.needsConfirmation, true); assert.equal(await out('log', '-1', '--format=%s'), 'first, with b');
  assert.equal((await amendCommit(repo, 'again', true)).ok, true);
});

test('commit actions, merge with conflicts and abort, and branch and tag deletion', async () => {
  const { repo, git, out } = await makeRepo();
  const first = await out('rev-parse', 'HEAD');
  await commitAction(repo, 'branch', first, 'side'); await commitAction(repo, 'tag', first, 'v0.1');
  assert.match(await out('tag'), /v0\.1/);
  await assert.rejects(commitAction(repo, 'branch', first, 'bad..name'), /not a valid|invalid/i);
  await git('checkout', '-q', 'side'); fs.writeFileSync(path.join(repo, 'a.txt'), 'side\n'); await git('commit', '-q', '-am', 'side change');
  const sideCommit = await out('rev-parse', 'HEAD');
  await git('checkout', '-q', 'main'); fs.writeFileSync(path.join(repo, 'a.txt'), 'main\n'); await git('commit', '-q', '-am', 'main change');
  const merged = await mergeBranch(repo, 'side');
  assert.equal(merged.ok, false); assert.equal((merged as any).conflict, 'merge'); assert.equal(pendingOperation(repo), 'merge');
  await abortOperation(repo); assert.equal(pendingOperation(repo), null);
  const picked = await commitAction(repo, 'cherry-pick', sideCommit);
  assert.equal(picked.ok, false); await abortOperation(repo);
  const asked = await deleteBranch(repo, 'side', false);
  assert.equal(asked.ok, false); assert.equal((asked as any).needsConfirmation, true);
  assert.equal((await deleteBranch(repo, 'side', true)).ok, true);
  await assert.rejects(deleteBranch(repo, 'main', true), /Switch to another branch/);
  await deleteTag(repo, 'v0.1'); assert.equal(await out('tag'), '');
  fs.writeFileSync(path.join(repo, 'c.txt'), 'c\n'); await git('add', '.'); await git('commit', '-q', '-m', 'add c');
  const c = await out('rev-parse', 'HEAD');
  assert.equal((await commitAction(repo, 'revert', c)).ok, true); assert.equal(fs.existsSync(path.join(repo, 'c.txt')), false);
  await assert.rejects(commitAction(repo, 'checkout', '--help'), /Invalid commit/);
});
