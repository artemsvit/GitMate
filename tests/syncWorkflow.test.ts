import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { commit, stageFiles, push, pull, fetchAll, getRepoSummary, getSyncTargets, getNetworkGit, setRemoteUrl, authorizeHttpsRemote } from '../server/gitService';
import { getFilePreview } from '../server/filePreview';
import { redactRemote } from '../server/remoteSafety';
import { createRequire } from 'node:module';
const { credentialFor } = createRequire(import.meta.url)('../server/git-credential-helper.cjs');
const run = promisify(execFile);
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gitler-workflow-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'client'), bare = path.join(root, 'remote.git');
  await run('git', ['init', '--bare', bare]); await run('git', ['init', '-b', 'main', repo]);
  const git = (...args: string[]) => run('git', ['-C', repo, ...args]);
  await git('config', 'user.name', 'Fixture'); await git('config', 'user.email', 'fixture@example.invalid');
  await git('remote', 'add', 'origin', bare);
  return { root, repo, bare, git };
}

test('commit is local; push is verified remotely; fetch and pull advance the correct branch', async t => {
  const { root, repo, bare, git } = await fixture(t);
  await fs.writeFile(path.join(repo, 'file.txt'), 'first'); await stageFiles(repo);
  const hash = await commit(repo, 'first');
  await assert.rejects(run('git', ['--git-dir', bare, 'rev-parse', 'refs/heads/main']));
  assert.match(await push(repo), /Verified/);
  assert.equal((await run('git', ['--git-dir', bare, 'rev-parse', 'refs/heads/main'])).stdout.trim(), hash);
  assert.equal((await getRepoSummary(repo)).ahead, 0);
  const other = path.join(root, 'other'); await run('git', ['clone', '-b', 'main', bare, other]);
  await run('git', ['-C', other, 'config', 'user.name', 'Other']); await run('git', ['-C', other, 'config', 'user.email', 'other@example.invalid']);
  await fs.writeFile(path.join(other, 'file.txt'), 'remote change');
  await run('git', ['-C', other, 'commit', '-am', 'remote']); await run('git', ['-C', other, 'push']);
  await fetchAll(repo, 'origin'); assert.equal((await getRepoSummary(repo)).behind, 1);
  await pull(repo, 'origin'); assert.equal(await fs.readFile(path.join(repo, 'file.txt'), 'utf8'), 'remote change');
  await git('checkout', '-b', 'topic');
  assert.equal((await getSyncTargets(repo)).pushRemote, 'origin');
});

test('multiple push URLs require an explicit destination and never report local commit as remote success', async t => {
  const { root, repo, bare, git } = await fixture(t);
  const second = path.join(root, 'second.git'); await run('git', ['init', '--bare', second]);
  await git('remote', 'set-url', '--add', '--push', 'origin', bare);
  await git('remote', 'set-url', '--add', '--push', 'origin', second);
  await fs.writeFile(path.join(repo, 'file.txt'), 'one'); await stageFiles(repo); await commit(repo, 'one');
  await assert.rejects(push(repo), /push destinations/);
  await push(repo, 'origin', undefined, 1);
  await assert.rejects(run('git', ['--git-dir', bare, 'rev-parse', 'main']));
  assert.match((await run('git', ['--git-dir', second, 'rev-parse', 'main'])).stdout.trim(), /^[a-f0-9]{40}$/);
});

test('explicit pull remote overrides an existing upstream', async t => {
  const { root, repo, bare, git } = await fixture(t);
  await fs.writeFile(path.join(repo, 'file.txt'), 'base'); await stageFiles(repo); await commit(repo, 'base'); await push(repo);
  const other = path.join(root, 'other.git'); await run('git', ['clone', '--bare', bare, other]);
  await git('remote', 'add', 'other', other);
  const source = path.join(root, 'source'); await run('git', ['clone', '-b', 'main', other, source]);
  await run('git', ['-C', source, 'config', 'user.name', 'Fixture']); await run('git', ['-C', source, 'config', 'user.email', 'fixture@example.invalid']);
  await fs.writeFile(path.join(source, 'other.txt'), 'from other');
  await run('git', ['-C', source, 'add', '.']); await run('git', ['-C', source, 'commit', '-m', 'other']); await run('git', ['-C', source, 'push']);
  await pull(repo, 'other'); assert.equal(await fs.readFile(path.join(repo, 'other.txt'), 'utf8'), 'from other');
});

test('a rejected remote push leaves the commit local and reports failure', async t => {
  const { repo, bare } = await fixture(t);
  await fs.writeFile(path.join(bare, 'hooks', 'pre-receive'), '#!/bin/sh\necho "branch is protected" >&2\nexit 1\n', { mode: 0o755 });
  await fs.writeFile(path.join(repo, 'file.txt'), 'one'); await stageFiles(repo); await commit(repo, 'one');
  await assert.rejects(push(repo), /protected|rejected/);
  assert.equal((await getRepoSummary(repo)).lastCommit?.message, 'one');
});

test('image and SVG previews distinguish staged blobs from working-tree content and reject escaped paths', async t => {
  const { root, repo } = await fixture(t);
  const oldSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="red" width="100" height="100"/></svg>';
  const newSvg = oldSvg.replace('red', 'blue');
  await fs.writeFile(path.join(repo, 'image.svg'), oldSvg); await stageFiles(repo, ['image.svg']);
  await fs.writeFile(path.join(repo, 'image.svg'), newSvg);
  const staged = await getFilePreview(repo, 'image.svg', true), working = await getFilePreview(repo, 'image.svg');
  assert.equal(Buffer.from(staged.dataUrl.split(',')[1], 'base64').toString(), oldSvg);
  assert.equal(Buffer.from(working.dataUrl.split(',')[1], 'base64').toString(), newSvg);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/f1sAAAAASUVORK5CYII=', 'base64');
  await fs.writeFile(path.join(repo, 'image.png'), png); await stageFiles(repo, ['image.png']);
  assert.deepEqual(Buffer.from((await getFilePreview(repo, 'image.png', true)).dataUrl.split(',')[1], 'base64'), png);
  await fs.writeFile(path.join(root, 'outside.svg'), oldSvg); await fs.symlink(path.join(root, 'outside.svg'), path.join(repo, 'escape.svg'));
  await assert.rejects(getFilePreview(repo, 'escape.svg'), /outside/); await assert.rejects(getFilePreview(repo, '../outside.svg'), /outside/);
});

test('credential helpers match configured host and prefix and redact legacy URL credentials', () => {
  const config = { gitea: { connected: true, token: 'fixture', username: 'person', instanceUrl: 'https://fixture.invalid/gitea' } };
  assert.equal(credentialFor('protocol=https\nhost=fixture.invalid\npath=gitea/owner/repo.git\n', config).password, 'fixture');
  assert.equal(credentialFor('protocol=https\nhost=other.invalid\npath=gitea/owner/repo.git\n', config), null);
  assert.equal(credentialFor('protocol=https\nhost=fixture.invalid\npath=other/repo.git\n', config), null);
  assert.equal(redactRemote('https://ghp_fixturesecret@github.com/owner/repo.git'), 'https://github.com/owner/repo.git');
});

test('real Git HTTP fetch and push use account credentials without embedding the token in the remote', async t => {
  const { root, repo, bare, git } = await fixture(t);
  await run('git', ['--git-dir', bare, 'config', 'http.receivepack', 'true']);
  const backend = path.join((await run('git', ['--exec-path'])).stdout.trim(), 'git-http-backend');
  let authorizedRequests = 0;
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Basic ' + Buffer.from('fixture:fixture-token').toString('base64')) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="fixture"' }); res.end(); return;
    }
    authorizedRequests++;
    const url = new URL(req.url!, 'http://localhost');
    const child = spawn(backend, [], { env: { ...process.env, GIT_PROJECT_ROOT: root, GIT_HTTP_EXPORT_ALL: '1', REQUEST_METHOD: req.method,
      PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), CONTENT_TYPE: req.headers['content-type'] || '', CONTENT_LENGTH: req.headers['content-length'] || '', REMOTE_USER: 'fixture' } });
    req.pipe(child.stdin);
    const chunks: Buffer[] = []; child.stdout.on('data', chunk => chunks.push(chunk));
    child.on('close', () => {
      const response = Buffer.concat(chunks), split = response.indexOf('\r\n\r\n');
      for (const line of response.subarray(0, split).toString().split('\r\n')) {
        const colon = line.indexOf(':'); if (colon > 0) { const key = line.slice(0, colon), value = line.slice(colon + 1).trim(); if (key === 'Status') res.statusCode = Number(value.split(' ')[0]); else res.setHeader(key, value); }
      }
      res.end(response.subarray(split + 4));
    });
  }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const configDir = path.join(root, 'config'); await fs.mkdir(configDir);
  await fs.writeFile(path.join(configDir, 'providers.json'), JSON.stringify({ gitea: { connected: true, token: 'fixture-token', username: 'fixture', instanceUrl: base } }));
  const previous = process.env.GITLER_CONFIG_DIR; process.env.GITLER_CONFIG_DIR = configDir;
  t.after(() => { if (previous === undefined) delete process.env.GITLER_CONFIG_DIR; else process.env.GITLER_CONFIG_DIR = previous; });
  await git('remote', 'set-url', 'origin', base + '/remote.git');
  await fs.writeFile(path.join(repo, 'file.txt'), 'HTTP'); await stageFiles(repo); await commit(repo, 'HTTP');
  await push(repo); await fetchAll(repo, 'origin'); await pull(repo, 'origin');
  assert.ok(authorizedRequests >= 3);
  assert.equal((await git('remote', 'get-url', 'origin')).stdout.trim(), base + '/remote.git');
  await git('remote', 'set-url', 'origin', base.replace('://', '://legacy-user@') + '/remote.git');
  await fetchAll(repo, 'origin');
  const summary = await getRepoSummary(repo);
  assert.equal(summary.remotes[0].fetchUrl, base + '/remote.git');
  assert.equal(summary.remotes[0].hasEmbeddedCredentials, true);
});


test('push URL edits preserve the fetch URL and other destinations', async t => {
  const { root, repo, bare, git } = await fixture(t);
  const newPush = path.join(root, 'new.git'); await run('git', ['init', '--bare', newPush]);
  await setRemoteUrl(repo, 'origin', newPush, 'push', 0);
  assert.equal((await git('remote', 'get-url', 'origin')).stdout.trim(), bare);
  assert.equal((await git('remote', 'get-url', '--push', 'origin')).stdout.trim(), newPush);
  await git('remote', 'set-url', '--add', '--push', 'origin', bare);
  await setRemoteUrl(repo, 'origin', bare + '.second', 'push', 1);
  assert.equal((await git('remote', 'get-url', '--push', '--all', 'origin')).stdout.trim(), newPush + '\n' + bare + '.second');
});

test('authorization targets the selected push server and cleans credentials only on that server', async t => {
  const { root, repo, git } = await fixture(t);
  const calls: string[] = [];
  const serve = async (name: string) => {
    const server = http.createServer((req, res) => { calls.push(name); assert.equal(req.method, 'GET'); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ login: name })); }).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    return `http://127.0.0.1:${(server.address() as any).port}`;
  };
  const first = await serve('fetch-server'), second = await serve('push-server');
  await git('remote', 'set-url', 'origin', first + '/repo.git');
  await git('remote', 'set-url', '--add', '--push', 'origin', first + '/repo.git');
  await git('remote', 'set-url', '--add', '--push', 'origin', second.replace('://', '://legacy-user@') + '/repo.git');
  const configDir = path.join(root, 'authorization-config'); await fs.mkdir(configDir);
  const previous = process.env.GITLER_CONFIG_DIR; process.env.GITLER_CONFIG_DIR = configDir;
  t.after(() => { if (previous === undefined) delete process.env.GITLER_CONFIG_DIR; else process.env.GITLER_CONFIG_DIR = previous; });
  await authorizeHttpsRemote(repo, 'origin', 'gitea', 'fixture-token', 'push', 1);
  assert.deepEqual(calls, ['push-server']);
  assert.equal((await git('remote', 'get-url', 'origin')).stdout.trim(), first + '/repo.git');
  assert.equal((await git('remote', 'get-url', '--push', '--all', 'origin')).stdout.trim(), first + '/repo.git\n' + second + '/repo.git');
});
