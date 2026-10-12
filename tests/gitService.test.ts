import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getRepoDetails, getRepoSummary, getDiff, stageFiles, unstageFiles, updateGlobalGitConfig, testHostSsh, getGit, testRemoteConnection } from '../server/gitService';

const run = promisify(execFile);
async function fixture(t: any) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitler-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const git = (...args: string[]) => run('git', ['-C', dir, ...args]);
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Fixture');
  await git('config', 'user.email', 'fixture@example.invalid');
  return { dir, git, write: (file: string, content: string | Buffer) => fs.writeFile(path.join(dir, file), content) };
}

test('partial staging counts both states and previews index and worktree separately', async t => {
  const { dir, git, write } = await fixture(t);
  await write('partial.txt', 'original\n'); await stageFiles(dir); await git('commit', '-m', 'initial');
  await write('partial.txt', 'staged\n'); await write('new.txt', 'new\n');
  await stageFiles(dir, ['partial.txt', 'new.txt']); await write('partial.txt', 'working\n'); await write('untracked.txt', 'untracked\n');
  const details = await getRepoDetails(dir);
  assert.equal(details.stagedCount, 2); assert.equal(details.unstagedCount, 2);
  const partial = details.files.find(f => f.path === 'partial.txt')!;
  assert.equal(partial.isStaged, true); assert.equal(partial.isUnstaged, true);
  assert.match(await getDiff(dir, 'partial.txt', true), /\+staged/);
  assert.match(await getDiff(dir, 'partial.txt', false), /\+working/);
  assert.match(await getDiff(dir, 'untracked.txt'), /\+untracked/);
});

test('empty repositories and unstage before the first commit preserve files', async t => {
  const { dir, write } = await fixture(t);
  assert.deepEqual((await getRepoDetails(dir)).files, []);
  await write('first.txt', 'first'); await stageFiles(dir, ['first.txt']);
  assert.equal((await getRepoSummary(dir)).stagedCount, 1);
  await unstageFiles(dir);
  assert.equal((await getRepoSummary(dir)).unstagedCount, 1);
  assert.equal(await fs.readFile(path.join(dir, 'first.txt'), 'utf8'), 'first');
});

test('renames retain the original path and deletions retain their index state', async t => {
  const { dir, git, write } = await fixture(t);
  await write('before.txt', 'rename\n'); await write('delete.txt', 'delete\n'); await stageFiles(dir); await git('commit', '-m', 'initial');
  await git('mv', 'before.txt', 'after.txt'); await git('rm', 'delete.txt');
  const details = await getRepoDetails(dir);
  const renamed = details.files.find(f => f.path === 'after.txt')!;
  assert.equal(renamed.indexStatus, 'R'); assert.equal(renamed.originalPath, 'before.txt');
  assert.equal(renamed.isUnstaged, false); assert.equal(details.stagedCount, 2);
  assert.equal(details.files.find(f => f.path === 'delete.txt')!.indexStatus, 'D');
});

test('merge conflicts remain visible as unstaged and cannot be mistaken for commit-ready files', async t => {
  const { dir, git, write } = await fixture(t);
  await write('conflict.txt', 'base\n'); await stageFiles(dir); await git('commit', '-m', 'base');
  await git('checkout', '-b', 'other'); await write('conflict.txt', 'other\n'); await stageFiles(dir); await git('commit', '-m', 'other');
  await git('checkout', 'main'); await write('conflict.txt', 'main\n'); await stageFiles(dir); await git('commit', '-m', 'main');
  await assert.rejects(git('merge', 'other'));
  const file = (await getRepoDetails(dir)).files[0];
  assert.equal(file.indexStatus, 'U'); assert.equal(file.isStaged, false); assert.equal(file.isUnstaged, true);
});

test('read operations keep an old Git index lock', async t => {
  const { dir } = await fixture(t);
  const lock = path.join(dir, '.git', 'index.lock'); await fs.writeFile(lock, 'owned');
  const old = new Date(Date.now() - 60000); await fs.utimes(lock, old, old);
  await getRepoSummary(dir); await getRepoDetails(dir);
  assert.equal(await fs.readFile(lock, 'utf8'), 'owned');
});

test('untracked preview is bounded, binary-aware, and does not follow symlinks', async t => {
  const { dir, write } = await fixture(t);
  await write('binary.dat', Buffer.from([1, 0, 2])); await write('large.txt', 'a'.repeat(300000));
  await fs.symlink('/etc/passwd', path.join(dir, 'link'));
  assert.match(await getDiff(dir, 'binary.dat'), /Binary file/);
  assert.match(await getDiff(dir, 'large.txt'), /preview limit/);
  assert.match(await getDiff(dir, 'link'), /\+\/etc\/passwd/);
  await assert.rejects(getDiff(dir, '../outside.txt'), /outside/);
  await assert.rejects(stageFiles(dir, ['../outside.txt']), /outside/);
  await assert.rejects(getDiff(dir, '.git/config'), /outside/);
});

test('file paths use literal Git pathspecs, including leading dashes and wildcards', async t => {
  const { dir, write } = await fixture(t);
  await write('*.txt', 'literal'); await write('other.txt', 'other'); await write('-file.txt', 'dash');
  await stageFiles(dir, ['*.txt', '-file.txt']);
  const details = await getRepoDetails(dir);
  assert.equal(details.stagedCount, 2); assert.equal(details.files.find(f => f.path === 'other.txt')!.isStaged, false);
});

test('global identity values remain literal and malformed SSH targets are rejected', async t => {
  const { dir } = await fixture(t);
  const previous = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = path.join(dir, 'isolated-config');
  t.after(() => { if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previous; });
  const value = `Name $(touch ${dir}/injected) \`touch ${dir}/injected\``;
  await updateGlobalGitConfig({ userName: value });
  const result = await run('git', ['config', '--global', '--get', 'user.name']);
  assert.equal(result.stdout.trim(), value); await assert.rejects(fs.access(path.join(dir, 'injected')));
  await assert.rejects(testHostSsh('host;touch /tmp/injected'));
  await assert.rejects(testHostSsh('-oProxyCommand=anything'));
  await assert.rejects(testHostSsh('localhost', 65536));
});

test('simple-git applies the dedicated SSH command to its child process', async t => {
  const { dir, git } = await fixture(t);
  const script = path.join(dir, 'ssh'); const output = path.join(dir, 'ssh-args');
  await fs.writeFile(script, `#!/bin/sh\nprintf "%s\\n" "$@" > '${output}'\nexit 1\n`, { mode: 0o755 });
  const previous = process.env.PATH;
  process.env.PATH = `${dir}:${previous}`;
  t.after(() => { process.env.PATH = previous; });
  await git('remote', 'add', 'origin', 'ssh://git@fixture.invalid/repo');
  await assert.rejects(getGit(dir).listRemote(['origin']));
  const args = await fs.readFile(output, 'utf8');
  assert.match(args, /BatchMode=yes/); assert.match(args, /ConnectTimeout=15/);
  if (await fs.access(path.join(os.homedir(), '.ssh/gitler_ed25519')).then(() => true, () => false)) assert.match(args, /gitler_ed25519/);
});


test('repository read checks report the fetch provider when push uses another host', async t => {
  const { dir, git, write } = await fixture(t);
  await write('README.md', 'fixture'); await stageFiles(dir); await git('commit', '-m', 'fixture');
  await git('remote', 'add', 'origin', dir);
  await git('remote', 'set-url', '--push', 'origin', 'https://github.com/fixture/repository.git');
  const result = await testRemoteConnection(dir, 'origin');
  assert.equal(result.success, true); assert.equal(result.detectedProvider, 'generic');
  assert.match(result.message, /Repository read access verified/);
});
