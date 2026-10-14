import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { app } from '../server/index';
import { generateCommitMessage } from '../server/aiService';

const run = promisify(execFile);
test('API access, repository scope, and staged-only suggestions', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const request = (route: string, init: RequestInit = {}): Promise<Response> => new Promise((resolve, reject) => {
    const req = http.request(base + route, { method: init.method || 'GET', headers: Object.fromEntries(new Headers({ Host: 'localhost:3001', ...init.headers as Record<string, string> })) }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers as Record<string, string> })));
    });
    req.on('error', reject); req.end(init.body);
  });
  assert.equal((await request('/api/system/folders')).status, 401);
  assert.equal((await request('/api/copilot/model')).status, 401);
  assert.equal((await request('/api/copilot/conversations')).status, 401);
  assert.equal((await request('/api/session', { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await request('/api/session', { headers: { Host: 'attacker.invalid' } })).status, 403);
  assert.equal((await request('/api/session', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const sessionResponse = await request('/api/session');
  assert.equal(sessionResponse.headers.get('access-control-allow-origin'), null);
  const { token } = await sessionResponse.json() as { token: string };
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const post = (route: string, data: unknown) => request(route, { method: 'POST', headers, body: JSON.stringify(data) });
  assert.equal((await request('/api/system/folders', { headers })).status, 200);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gitmate-api-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await run('git', ['init', '-b', 'main', root]);
  const detailsUrl = `/api/repos/details?path=${encodeURIComponent(root)}`;
  assert.equal((await request(detailsUrl, { headers })).status, 403);
  assert.equal((await post('/api/copilot/chat', { path: root, question: 'Summarize' })).status, 403);
  assert.equal((await post('/api/repos/scan', { rootDir: root, maxDepth: 100 })).status, 400);
  assert.equal((await post('/api/repos/scan', { rootDir: root, maxDepth: 0 })).status, 200);
  assert.equal((await request(detailsUrl, { headers })).status, 200);
  assert.equal((await post('/api/copilot/chat', { path: root, additionalRepos: ['/not-scanned'], question: 'Summarize' })).status, 403);
  assert.equal((await request(`/api/copilot/conversations?path=${encodeURIComponent(root)}`, { headers })).status, 200);
  await fs.writeFile(path.join(root, 'only-untracked.txt'), 'untracked');
  const unstaged = await post('/api/ai/generate-commit', { repoPath: root });
  assert.equal(unstaged.status, 400); assert.match((await unstaged.json() as any).error, /Stage/);
  await fs.writeFile(path.join(root, 'README.md'), 'staged docs\n');
  assert.equal((await post('/api/repos/stage', { path: root, files: ['README.md'] })).status, 200);
  const suggestion = await post('/api/ai/generate-commit', { repoPath: root });
  assert.equal(suggestion.status, 200);
  assert.match((await suggestion.json() as any).message, /^docs/);
  assert.equal((await post('/api/repos/stage', { path: root, files: ['../outside'] })).status, 500);
  assert.equal((await post('/api/settings/test-host', { host: 'localhost;echo injected' })).status, 500);
});

test('external model requests reject remote endpoints before detection or transmission', async () => {
  await assert.rejects(generateCommitMessage({ diff: 'private', repoName: 'fixture', provider: 'external', endpoint: 'https://attacker.invalid' }), /local model endpoints/);
});
