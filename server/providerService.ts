import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';
import { getOrCreateSshKey, sshKeyTitle } from './gitService.js';
import { configDir } from './paths';

interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

interface HttpResponse {
  status: number;
  ok: boolean;
  data: string;
  json: <T = any>() => Promise<T>;
  text: () => Promise<string>;
}

export function normalizeUrl(rawUrl: string, defaultProtocol = 'http://'): string {
  let trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `${defaultProtocol}${trimmed}`;
  }
  return trimmed.replace(/\/+$/, '');
}

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const runFile = promisify(execFile);

export function isLocalAddress(urlStr: string): boolean {
  try {
    const hostname = new URL(urlStr).hostname.replace(/^\[|\]$/g, '');
    return /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd][0-9a-f]*:|fe80:)/i.test(hostname) || hostname.endsWith('.local');
  } catch { return false; }
}

function validatedUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Enter an HTTP or HTTPS server URL without credentials.');
  }
  return url;
}

export function describeNetworkError(error: any, url: string): Error {
  const code = error?.cause?.code || error?.code || '';
  const detail = String(error?.message || 'Network request failed.');
  if (/redirected to a different address|HTTP or HTTPS server URL/.test(detail)) return new Error(detail);
  if (/CERT|TLS|SSL/i.test(code + ' ' + detail)) return new Error(`The certificate for ${new URL(url).origin} could not be verified. Check the server certificate and the Mac clock.`);
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(code + ' ' + detail)) return new Error(`The server at ${new URL(url).origin} refused the connection. Check the server address, port, and service.`);
  if (isLocalAddress(url)) return new Error(`Cannot reach ${new URL(url).origin}. On macOS, allow Git Mate in System Settings → Privacy & Security → Local Network, then retry. If access is already allowed, check the server address, Wi-Fi, and VPN.`);
  return new Error(`Cannot reach ${new URL(url).origin}. Check your internet connection and server address.`);
}

// Node transport is used by the browser development server. Packaged apps use Electron's own session.
export function httpRequest(urlStr: string, options: HttpRequestOptions = {}, redirectsLeft = 3): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    try {
      const parsed = validatedUrl(urlStr);
      const transport = parsed.protocol === 'https:' ? https : http;
      const req = transport.request(parsed, {
        method: options.method || 'GET', headers: { 'User-Agent': 'GitMate-App', ...options.headers },
        timeout: options.timeoutMs ?? 15000
      }, res => {
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          const target = validatedUrl(new URL(res.headers.location, parsed).href);
          if (!redirectsLeft || target.origin !== parsed.origin) return reject(new Error('The server redirected to a different address. Enter its final URL before sending credentials.'));
          return httpRequest(target.href, options, redirectsLeft - 1).then(resolve, reject);
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          body += chunk;
          if (body.length > 2 * 1024 * 1024) req.destroy(new Error('Server response is too large.'));
        });
        res.on('error', reject);
        res.on('end', () => {
          const status = res.statusCode || 0;
          resolve({ status, ok: status >= 200 && status < 300, data: body, json: async () => JSON.parse(body), text: async () => body });
        });
      });
      req.on('timeout', () => req.destroy(new Error('Connection timed out.')));
      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    } catch (error) { reject(error); }
  });
}

export async function universalFetch(urlStr: string, options: HttpRequestOptions = {}, redirectsLeft = 3): Promise<HttpResponse> {
  const parsed = validatedUrl(urlStr);
  const electronNetFetch = (globalThis as any).__electronNetFetch;
  if (typeof electronNetFetch !== 'function') return httpRequest(urlStr, options, redirectsLeft);
  // Do not switch to a child process when macOS denies access. The user must grant access to Git Mate.
  const response = await electronNetFetch(urlStr, {
    method: options.method || 'GET', headers: { 'User-Agent': 'GitMate-App', ...options.headers },
    ...(options.body ? { body: options.body } : {}),
    redirect: 'manual', signal: AbortSignal.timeout(options.timeoutMs ?? 15000)
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) {
    const target = validatedUrl(new URL(response.headers.get('location'), parsed).href);
    if (!redirectsLeft || target.origin !== parsed.origin) throw new Error('The server redirected to a different address. Enter its final URL before sending credentials.');
    return universalFetch(target.href, options, redirectsLeft - 1);
  }
  const body = await response.text();
  if (body.length > 2 * 1024 * 1024) throw new Error('Server response is too large.');
  return { status: response.status, ok: response.ok, data: body, json: async () => JSON.parse(body), text: async () => body };
}

export interface ProviderAccount {
  connected: boolean;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  instanceUrl?: string;
  token?: string;
  authMethod: 'token' | 'gh_cli' | 'ssh';
  sshKeySynced?: boolean;
  lastChecked?: string;
}

export interface ProvidersConfig {
  github?: ProviderAccount;
  gitlab?: ProviderAccount;
  gitea?: ProviderAccount;
}

const CONFIG_DIR = () => configDir();
const CONFIG_FILE = () => path.join(configDir(), 'providers.json');

function ensureConfigDir(): void {
  try {
    if (!fs.existsSync(CONFIG_DIR())) {
      fs.mkdirSync(CONFIG_DIR(), { recursive: true, mode: 0o700 });
    }
  } catch {}
}

export function readProvidersConfig(): ProvidersConfig {
  try {
    if (fs.existsSync(CONFIG_FILE())) {
      const raw = fs.readFileSync(CONFIG_FILE(), 'utf8');
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

export function writeProvidersConfig(config: ProvidersConfig): void {
  ensureConfigDir();
  const temporary = `${CONFIG_FILE()}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(config, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, CONFIG_FILE());
  } catch {
    throw new Error('Could not save your account settings. Check access to the Git Mate configuration folder.');
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export async function getProvidersStatus(): Promise<{
  github: Omit<ProviderAccount, 'token'>;
  gitlab: Omit<ProviderAccount, 'token'>;
  gitea: Omit<ProviderAccount, 'token'>;
}> {
  const config = readProvidersConfig();

  // Check if GitHub CLI is active as fallback for GitHub if not explicitly configured
  let githubCliAccount: { username: string } | null = null;
  if (config.github === undefined) {
    try {
      const { exec } = await import('child_process');
      const ghStatus = await new Promise<string>(resolve => {
        exec('gh auth status', { timeout: 3000 }, (_err, stdout, stderr) => {
          resolve((stdout || '') + ' ' + (stderr || ''));
        });
      });
      const match = ghStatus.match(/account\s+([a-zA-Z0-9_-]+)/i) || ghStatus.match(/Logged in to [^ ]+ account ([a-zA-Z0-9_-]+)/i);
      if (match) {
        githubCliAccount = { username: match[1] };
      }
    } catch {}
  }

  const sanitize = (acc?: ProviderAccount, defaultUrl = ''): Omit<ProviderAccount, 'token'> => {
    if (!acc || !acc.connected) {
      return { connected: false, authMethod: 'token', instanceUrl: defaultUrl };
    }
    const { token, ...rest } = acc;
    return rest;
  };

  const githubResult: Omit<ProviderAccount, 'token'> = config.github?.connected
    ? sanitize(config.github)
    : githubCliAccount
      ? {
          connected: true,
          username: githubCliAccount.username,
          displayName: githubCliAccount.username,
          authMethod: 'gh_cli',
          instanceUrl: 'https://github.com'
        }
      : { connected: false, authMethod: 'token', instanceUrl: 'https://github.com' };

  return {
    github: githubResult,
    gitlab: sanitize(config.gitlab, 'https://gitlab.com'),
    gitea: sanitize(config.gitea, 'http://192.168.0.102:3000')
  };
}

async function keyAlreadyRegistered(provider: string, instance: string, token: string, publicKey: string): Promise<boolean> {
  const endpoint = provider === 'github' ? 'https://api.github.com/user/keys' : `${instance}/api/${provider === 'gitlab' ? 'v4' : 'v1'}/user/keys`;
  const response = await universalFetch(endpoint, { headers: { Authorization: `${provider === 'gitea' ? 'token' : 'Bearer'} ${token}`, Accept: 'application/json' } });
  if (!response.ok) return false;
  const keys: any = await response.json();
  const fingerprint = publicKey.trim().split(/\s+/).slice(0, 2).join(' ');
  return Array.isArray(keys) && keys.some(key => typeof key.key === 'string' && key.key.trim().split(/\s+/).slice(0, 2).join(' ') === fingerprint);
}

export async function connectProvider(params: {
  provider: 'github' | 'gitlab' | 'gitea';
  token: string;
  instanceUrl?: string;
  syncSshKey?: boolean;
}): Promise<{
  success: boolean;
  account: Omit<ProviderAccount, 'token'>;
  sshSyncedMessage?: string;
}> {
  const { provider, token } = params;
  if (!token || !token.trim()) {
    throw new Error('Token is required.');
  }

  const cleanToken = token.trim();
  if (/\s/.test(cleanToken)) throw new Error('The token contains whitespace. Paste the complete token without spaces.');
  const rawUrl = (params.instanceUrl || '').trim();

  let account: ProviderAccount;
  let sshSyncedMessage: string | undefined;

  if (provider === 'github') {
    const res = await universalFetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub verification failed (${res.status}): ${errText || 'Invalid token or insufficient permissions.'}`);
    }

    const data: any = await res.json();
    account = {
      connected: true,
      username: data.login,
      displayName: data.name || data.login,
      avatarUrl: data.avatar_url,
      instanceUrl: 'https://github.com',
      token: cleanToken,
      authMethod: 'token',
      lastChecked: new Date().toISOString()
    };
  } else if (provider === 'gitlab') {
    const instance = rawUrl ? normalizeUrl(rawUrl, 'https://') : 'https://gitlab.com';
    const res = await universalFetch(`${instance}/api/v4/user`, {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/json'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitLab verification failed (${res.status}): ${errText || 'Invalid token or unreachable host.'}`);
    }

    const data: any = await res.json();
    account = {
      connected: true,
      username: data.username,
      displayName: data.name || data.username,
      avatarUrl: data.avatar_url,
      instanceUrl: instance,
      token: cleanToken,
      authMethod: 'token',
      lastChecked: new Date().toISOString()
    };
  } else if (provider === 'gitea') {
    if (!rawUrl) {
      throw new Error('Server URL is required for Gitea (e.g. http://192.168.0.102:3000).');
    }
    const instance = normalizeUrl(rawUrl, 'http://');
    let userRes: HttpResponse;
    try {
      userRes = await universalFetch(`${instance}/api/v1/user`, {
        headers: {
          Authorization: `token ${cleanToken}`,
          Accept: 'application/json'
        }
      });
    } catch (netErr: any) {
      throw describeNetworkError(netErr, instance);
    }

    if (!userRes.ok) {
      const errText = await userRes.text();
      throw new Error(`Gitea verification failed (${userRes.status}): ${errText || 'Invalid token or unreachable server.'}`);
    }

    const userData: any = await userRes.json();
    account = {
      connected: true,
      username: userData.login,
      displayName: userData.full_name || userData.login,
      avatarUrl: userData.avatar_url,
      instanceUrl: instance,
      token: cleanToken,
      authMethod: 'token',
      lastChecked: new Date().toISOString()
    };

    // Auto-sync Git Mate's SSH key directly into Gitea
    try {
      const keyInfo = params.syncSshKey === false ? null : await getOrCreateSshKey(false);
      if (keyInfo?.publicKey) {
        const keyPostRes = await universalFetch(`${instance}/api/v1/user/keys`, {
          method: 'POST',
          headers: {
            Authorization: `token ${cleanToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            title: sshKeyTitle,
            key: keyInfo.publicKey,
            read_only: false
          })
        });

        if (keyPostRes.status === 201) {
          account.sshKeySynced = true;
          sshSyncedMessage = 'Git Mate SSH key automatically installed into Gitea!';
        } else if (keyPostRes.status === 422 && await keyAlreadyRegistered('gitea', instance, cleanToken, keyInfo.publicKey)) {
          account.sshKeySynced = true;
          sshSyncedMessage = 'Git Mate SSH key already registered on Gitea.';
        }
      }
    } catch (e: any) {
      console.warn('Could not auto-sync SSH key to Gitea:', e?.message);
    }
  } else {
    throw new Error('Unsupported provider.');
  }

  const config = readProvidersConfig();
  config[provider] = account;
  writeProvidersConfig(config);

  const { token: _, ...safeAccount } = account;
  return { success: true, account: safeAccount, sshSyncedMessage };
}

export async function disconnectProvider(provider: 'github' | 'gitlab' | 'gitea'): Promise<void> {
  const config = readProvidersConfig();
  if (provider === 'github') {
    config.github = { connected: false, authMethod: 'token', instanceUrl: 'https://github.com' };
  } else if (config[provider]) {
    delete config[provider];
  }
  writeProvidersConfig(config);
}

export async function syncSshKeyToProvider(provider: 'github' | 'gitlab' | 'gitea'): Promise<{
  success: boolean;
  message: string;
}> {
  const config = readProvidersConfig();
  const acc = config[provider];
  if (!acc || !acc.token) {
    throw new Error(`Cannot sync SSH key: ${provider} is not connected with a token.`);
  }

  const keyInfo = await getOrCreateSshKey(false);
  if (!keyInfo.publicKey) {
    throw new Error('No local Git Mate SSH key found.');
  }

  if (provider === 'gitea') {
    const instance = normalizeUrl(acc.instanceUrl || 'http://192.168.0.102:3000', 'http://');
    const res = await universalFetch(`${instance}/api/v1/user/keys`, {
      method: 'POST',
      headers: {
        Authorization: `token ${acc.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        title: sshKeyTitle,
        key: keyInfo.publicKey,
        read_only: false
      })
    });

    if (res.status === 201) {
      acc.sshKeySynced = true;
      writeProvidersConfig(config);
      return { success: true, message: 'SSH key uploaded to Gitea successfully!' };
    }
    if (res.status === 422 && await keyAlreadyRegistered(provider, instance, acc.token, keyInfo.publicKey)) {
      acc.sshKeySynced = true;
      writeProvidersConfig(config);
      return { success: true, message: 'SSH key is already active in your Gitea account.' };
    }
    const errText = await res.text();
    throw new Error(`Failed to upload key to Gitea (${res.status}): ${errText}`);
  }

  if (provider === 'gitlab') {
    const instance = normalizeUrl(acc.instanceUrl || 'https://gitlab.com', 'https://');
    const res = await universalFetch(`${instance}/api/v4/user/keys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${acc.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: sshKeyTitle,
        key: keyInfo.publicKey
      })
    });

    if (res.status === 201) {
      acc.sshKeySynced = true;
      writeProvidersConfig(config);
      return { success: true, message: 'SSH key uploaded to GitLab successfully!' };
    }
    if ((res.status === 400 || res.status === 422) && await keyAlreadyRegistered(provider, instance, acc.token, keyInfo.publicKey)) {
      acc.sshKeySynced = true;
      writeProvidersConfig(config);
      return { success: true, message: 'SSH key is already active in your GitLab account.' };
    }
    const errText = await res.text();
    throw new Error(`Failed to upload key to GitLab (${res.status}): ${errText}`);
  }

  if (provider === 'github') {
    const res = await universalFetch('https://api.github.com/user/keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${acc.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        title: sshKeyTitle,
        key: keyInfo.publicKey
      })
    });

    if (res.status === 201) {
      acc.sshKeySynced = true;
      writeProvidersConfig(config);
      return { success: true, message: 'SSH key uploaded to GitHub successfully!' };
    }
    if (res.status === 422 && await keyAlreadyRegistered(provider, 'https://github.com', acc.token, keyInfo.publicKey)) {
      acc.sshKeySynced = true;
      writeProvidersConfig(config);
      return { success: true, message: 'SSH key is already active in your GitHub account.' };
    }
    const errText = await res.text();
    throw new Error(`Failed to upload key to GitHub (${res.status}): ${errText}`);
  }

  throw new Error('Unsupported provider.');
}

export async function testProviderConnection(provider: 'github' | 'gitlab' | 'gitea', instanceUrl?: string) {
  if (!['github', 'gitlab', 'gitea'].includes(provider)) throw new Error('Choose GitHub, GitLab, or Gitea.');
  const config = readProvidersConfig();
  const account = config[provider];
  const instance = provider === 'github' ? 'https://github.com' : normalizeUrl(instanceUrl || account?.instanceUrl || (provider === 'gitlab' ? 'https://gitlab.com' : ''), provider === 'gitlab' ? 'https://' : 'http://');
  if (!instance) throw new Error('Enter your server URL first.');
  validatedUrl(instance);
  let token = account?.instanceUrl && normalizeUrl(account.instanceUrl) === instance ? account.token : undefined;
  if (provider === 'github' && !token && config.github === undefined) {
    try { token = (await runFile('gh', ['auth', 'token', '--hostname', 'github.com'], { timeout: 3000 })).stdout.trim(); } catch {}
  }
  const endpoint = provider === 'github' ? 'https://api.github.com/user' : `${instance}/api/${provider === 'gitlab' ? 'v4' : 'v1'}/user`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `${provider === 'gitea' ? 'token' : 'Bearer'} ${token}`;
  try {
    const response = await universalFetch(endpoint, { headers });
    if (response.status === 401 || response.status === 403) {
      return { reachable: true, authenticated: false, state: token ? 'authorization_failed' : 'sign_in_required',
        message: token ? 'Server reached. Your token was rejected or lacks permission. Reconnect with a valid token.' : 'Server reached. Connect your account to verify private repository access.' };
    }
    if (!response.ok) return { reachable: true, authenticated: false, state: 'server_error', message: `Server reached, but the provider API returned HTTP ${response.status}. Check the server URL.` };
    let data: any;
    try { data = await response.json(); } catch { return { reachable: true, authenticated: false, state: 'server_error', message: 'The server returned a web page instead of the provider API. Check its URL or proxy login.' }; }
    const username = provider === 'gitlab' ? data.username : data.login;
    if (!username) return { reachable: true, authenticated: false, state: 'server_error', message: 'The address did not return a valid provider account.' };
    return { reachable: true, authenticated: true, state: 'ready', username, message: `Account access verified as @${username}. Test a repository remote to verify Git access.` };
  } catch (error: any) {
    return { reachable: false, authenticated: false, state: 'unreachable', diagnosticCode: error?.cause?.code || error?.code || String(error?.message).match(/ERR_[A-Z_]+/)?.[0] || 'NETWORK_ERROR', message: describeNetworkError(error, instance).message };
  }
}
