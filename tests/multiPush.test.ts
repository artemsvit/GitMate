import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { commit, stageFiles, pushDestinations, withRepositoryMutation, getRepoSummary } from '../server/gitService';
const run = promisify(execFile);
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gitmate-multipush-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'client'); const first = path.join(root, 'first.git'); const second = path.join(root, 'second.git');
  await run('git', ['init', '-b', 'main', repo]); for (const remote of [first, second]) await run('git', ['init', '--bare', '-b', 'main', remote]);
  const git = (...args: string[]) => run('git', ['-C', repo, ...args]);
  await git('config', 'user.name', 'Fixture'); await git('config', 'user.email', 'fixture@example.invalid');
  await git('remote', 'add', 'origin', first); await git('remote', 'add', 'mirror', second);
  await fs.writeFile(path.join(repo, 'file.txt'), 'base'); await stageFiles(repo); const hash = await commit(repo, 'base');
  const targets = [{ remote: 'origin', pushIndex: 0, url: first }, { remote: 'mirror', pushIndex: 0, url: second }];
  return {root, repo, first, second, git, hash, targets};
}
test('multi-push verifies the same commit once at each selected destination and deduplicates URLs', async t => {
  const { repo, first, second, git, hash, targets } = await fixture(t);
  await git('remote', 'add', 'duplicate', first);
  const report = await pushDestinations(repo, [...targets, { remote: 'duplicate', pushIndex: 0, url: first }], hash);
  assert.equal(report.results.length, 2); assert.equal(report.success, true);
  for (const remote of [first, second]) assert.equal((await run('git', ['--git-dir', remote, 'rev-parse', 'main'])).stdout.trim(), hash);
});
test('multi-push continues after a rejection and retries only failed destinations without another commit', async t => {
  const { repo, first, second, git, hash, targets } = await fixture(t);
  const hook = path.join(first, 'hooks/pre-receive'); await fs.writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const report = await pushDestinations(repo, targets, hash); assert.equal(report.success, false); assert.deepEqual(report.results.map(result => result.status), ['failed', 'verified']);
  assert.equal((await run('git', ['--git-dir', second, 'rev-parse', 'main'])).stdout.trim(), hash);
  await fs.rm(hook); const retry = await pushDestinations(repo, report.results.filter(result => result.status !== 'verified').map(result => result.destination), report.commitHash);
  assert.equal(retry.success, true); assert.equal((await git('rev-list', '--count', 'HEAD')).stdout.trim(), '1');
});
test('stale target URLs and changed local commits are rejected before any push', async t => {
  const { repo, first, second, git, hash, targets } = await fixture(t);
  await git('remote', 'set-url', 'mirror', first); await assert.rejects(pushDestinations(repo, targets, hash), /changed/);
  await assert.rejects(run('git', ['--git-dir', first, 'rev-parse', 'main']));
  await git('remote', 'set-url', 'mirror', second); await fs.writeFile(path.join(repo, 'file.txt'), 'next'); await stageFiles(repo); await commit(repo, 'next');
  await assert.rejects(pushDestinations(repo, targets, hash), /commit changed/);
});
test('repository mutation lock rejects overlaps and releases after success or failure', async t => {
  const { repo } = await fixture(t); let release!: () => void;
  const blocker = withRepositoryMutation(repo, () => new Promise<void>(resolve => { release = resolve; }));
  await assert.rejects(stageFiles(repo), /Another operation/); release(); await blocker;
  await assert.rejects(withRepositoryMutation(repo, async () => { throw new Error('fixture'); }), /fixture/); await stageFiles(repo);
});
test('multi-push sets the upstream to the preferred remote even when another destination is pushed first', async t => {
  const { repo, git, hash, targets } = await fixture(t);
  const report = await pushDestinations(repo, [...targets].reverse(), hash);
  assert.equal(report.success, true);
  assert.equal((await git('rev-parse', '--abbrev-ref', 'main@{upstream}')).stdout.trim(), 'origin/main');
  assert.equal((await git('rev-parse', 'refs/remotes/mirror/main')).stdout.trim(), hash);
});
test('a destination with newer commits gets a clear pull-first message and the other destination still succeeds', async t => {
  const { root, repo, first, second, hash, targets } = await fixture(t);
  await pushDestinations(repo, targets, hash);
  const other = path.join(root, 'other'); await run('git', ['clone', '-q', first, other]); const og = (...a: string[]) => run('git', ['-C', other, ...a]);
  await og('config', 'user.name', 'Other'); await og('config', 'user.email', 'other@example.invalid');
  await fs.writeFile(path.join(other, 'remote.txt'), 'x'); await og('add', '.'); await og('commit', '-qm', 'remote work'); await og('push', '-q', 'origin', 'main');
  await fs.writeFile(path.join(repo, 'file.txt'), 'local'); await stageFiles(repo); const local = await commit(repo, 'local');
  const report = await pushDestinations(repo, targets, local);
  assert.deepEqual(report.results.map(result => result.status), ['failed', 'verified']);
  assert.match(report.results[0].message, /"origin" has commits that your branch does not have/);
  assert.equal((await run('git', ['--git-dir', second, 'rev-parse', 'main'])).stdout.trim(), local);
});
test('a server hook refusal names the remote and shows the server message', async t => {
  const { repo, first, hash, targets } = await fixture(t);
  await fs.writeFile(path.join(first, 'hooks/pre-receive'), '#!/bin/sh\necho "protected branch"\nexit 1\n', { mode: 0o755 });
  const report = await pushDestinations(repo, targets, hash);
  assert.match(report.results[0].message, /"origin" refused the push \(pre-receive hook declined\)\. Server message: protected branch/);
});
test('the summary reports each remote: ahead, behind, or branch not there yet', async t => {
  const { repo, hash, targets } = await fixture(t);
  let summary = await getRepoSummary(repo);
  assert.deepEqual(summary.remotes.map(remote => remote.branch), [null, null]);
  await pushDestinations(repo, [targets[0]], hash);
  await fs.writeFile(path.join(repo, 'file.txt'), 'next'); await stageFiles(repo); await commit(repo, 'next');
  summary = await getRepoSummary(repo);
  const byName = Object.fromEntries(summary.remotes.map(remote => [remote.name, remote.branch]));
  assert.deepEqual(byName, { origin: { ahead: 1, behind: 0 }, mirror: null });
});
