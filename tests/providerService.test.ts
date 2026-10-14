import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { after } from 'node:test';
const testConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitmate-provider-test-'));
process.env.GITMATE_CONFIG_DIR = testConfigDir;
after(() => fs.rm(testConfigDir, { recursive: true, force: true }));
const { readProvidersConfig, writeProvidersConfig, getProvidersStatus, disconnectProvider,
  httpRequest, universalFetch, testProviderConnection, describeNetworkError, connectProvider } = await import('../server/providerService');

test('providerService persists and sanitizes provider configuration', async t => {
  const initial = readProvidersConfig();
  t.after(() => writeProvidersConfig(initial));

  writeProvidersConfig({
    github: {
      connected: true,
      username: 'octocat',
      displayName: 'The Octocat',
      token: 'secret-token-123',
      authMethod: 'token',
      instanceUrl: 'https://github.com'
    },
    gitea: {
      connected: true,
      username: 'giteauser',
      displayName: 'Gitea User',
      token: 'gitea-secret-456',
      authMethod: 'token',
      instanceUrl: 'http://192.168.0.102:3000',
      sshKeySynced: true
    }
  });

  const status = await getProvidersStatus();
  assert.equal(status.github.connected, true);
  assert.equal(status.github.username, 'octocat');
  // Token must not be leaked in status
  assert.equal((status.github as any).token, undefined);

  assert.equal(status.gitea.connected, true);
  assert.equal(status.gitea.username, 'giteauser');
  assert.equal(status.gitea.sshKeySynced, true);
  assert.equal((status.gitea as any).token, undefined);

  await disconnectProvider('github');
  const afterDisconnect = await getProvidersStatus();
  assert.equal(afterDisconnect.github.connected, false);
});

async function serve(t: any, handler: http.RequestListener) {
  const server = http.createServer(handler).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as any).port}`;
}

test('read-only provider tests distinguish reachable servers and authenticated accounts', async t => {
  const methods: string[] = [];
  const url = await serve(t, (req, res) => {
    methods.push(req.method!);
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization === 'token fixture-token') res.end(JSON.stringify({ login: 'fixture' }));
    else { res.statusCode = 401; res.end('{}'); }
  });
  assert.equal((await testProviderConnection('gitea', url)).state, 'sign_in_required');
  writeProvidersConfig({ gitea: { connected: true, authMethod: 'token', token: 'fixture-token', instanceUrl: url } });
  assert.equal((await testProviderConnection('gitea', url)).state, 'ready');
  assert.deepEqual(methods, ['GET', 'GET']);
});

test('HTTP transport never forwards credentials across origins', async t => {
  let leaked = false;
  const target = await serve(t, (_req, res) => { leaked = true; res.end('{}'); });
  const source = await serve(t, (_req, res) => { res.writeHead(302, { Location: target }); res.end(); });
  await assert.rejects(httpRequest(source, { headers: { Authorization: 'token fixture' } }), /different address/);
  assert.equal(leaked, false);
});

test('Electron transport preserves permission failure without a curl fallback', async t => {
  const previous = (globalThis as any).__electronNetFetch;
  t.after(() => { (globalThis as any).__electronNetFetch = previous; });
  let calls = 0;
  (globalThis as any).__electronNetFetch = async () => { calls++; throw Object.assign(new Error('ERR_NETWORK_ACCESS_DENIED'), { code: 'EACCES' }); };
  await assert.rejects(universalFetch('http://192.168.0.102:3000'), /DENIED/);
  assert.equal(calls, 1);
  assert.match(describeNetworkError({ code: 'EACCES' }, 'http://192.168.0.102:3000').message, /Local Network/);
  assert.match(describeNetworkError({ code: 'ECONNREFUSED' }, 'http://192.168.0.102:3000').message, /refused/);
});

test('Electron transport rejects credential redirects and invalid server schemes', async t => {
  const previous = (globalThis as any).__electronNetFetch;
  t.after(() => { (globalThis as any).__electronNetFetch = previous; });
  (globalThis as any).__electronNetFetch = async () => new Response('', { status: 302, headers: { Location: 'https://unrelated.invalid' } });
  await assert.rejects(universalFetch('https://gitlab.com', { headers: { Authorization: 'fixture' } }), /different address/);
  await assert.rejects(universalFetch('file:///etc/passwd'), /HTTP or HTTPS/);
});


test('HTTPS transport rejects an untrusted server certificate', async t => {
  const key = path.join(testConfigDir, 'tls-key.pem'), cert = path.join(testConfigDir, 'tls-cert.pem');
  await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-keyout', key, '-out', cert]);
  const server = https.createServer({ key: await fs.readFile(key), cert: await fs.readFile(cert) }, (_req, res) => res.end('{}')).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await assert.rejects(httpRequest(`https://127.0.0.1:${(server.address() as any).port}`), /self.signed certificate/i);
});


test('GitLab granular permission errors explain the fix without exposing the response or replacing a saved account', async t => {
  const initial = readProvidersConfig(); t.after(() => writeProvidersConfig(initial));
  const requests: string[] = [];
  const url = await serve(t, (req, res) => {
    requests.push(req.url!); res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'insufficient_granular_scope', error_description: 'User: Read required; fixture-private-response' }));
  });
  writeProvidersConfig({ gitlab: { connected: true, token: 'saved-fixture', instanceUrl: url, authMethod: 'token', username: 'saved-user' } });
  await assert.rejects(connectProvider({ provider: 'gitlab', token: 'replacement-fixture', instanceUrl: url }), error => {
    assert.match((error as Error).message, /User → Read/);
    assert.match((error as Error).message, /fine-grained/);
    assert.doesNotMatch((error as Error).message, /fixture-private-response|insufficient_granular_scope/);
    return true;
  });
  assert.equal(readProvidersConfig().gitlab!.token, 'saved-fixture');
  const check = await testProviderConnection('gitlab', url);
  assert.equal(check.state, 'authorization_failed'); assert.match(check.message, /User → Read/);
  assert.deepEqual(requests, ['/api/v4/user', '/api/v4/user']);
});

test('GitLab verification failures never echo arbitrary server response bodies', async t => {
  for (const status of [401, 403, 500]) {
    const url = await serve(t, (_req, res) => { res.writeHead(status); res.end('fixture-private-response'); });
    await assert.rejects(connectProvider({ provider: 'gitlab', token: 'fixture', instanceUrl: url }), error => {
      assert.doesNotMatch((error as Error).message, /fixture-private-response/); return true;
    });
  }
});

test('GitLab account verification succeeds without repository or SSH-key operations', async t => {
  const initial = readProvidersConfig(); t.after(() => writeProvidersConfig(initial));
  const requests: string[] = [];
  const url = await serve(t, (req, res) => {
    requests.push(`${req.method} ${req.url}`); assert.equal(req.headers.authorization, 'Bearer fixture');
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ username: 'fixture-user', name: 'Fixture User' }));
  });
  const result = await connectProvider({ provider: 'gitlab', token: 'fixture', instanceUrl: url });
  assert.equal(result.account.username, 'fixture-user'); assert.equal((result.account as any).token, undefined);
  assert.deepEqual(requests, ['GET /api/v4/user']);
});
