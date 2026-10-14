import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { commit, stageFiles, pushDestinations, withRepositoryMutation } from '../server/gitService';
const run = promisify(execFile);
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gitmate-multipush-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'client'); const first = path.join(root, 'first.git'); const second = path.join(root, 'second.git');
  await run('git', ['init', '-b', 'main', repo]); for (const remote of [first, second]) await run('git', ['init', '--bare', remote]);
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
