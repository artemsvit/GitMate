import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';
import { getOrCreateGitlerSshKey } from './gitService.js';

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

import { execFile } from 'child_process';

function isLocalAddress(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr);
    return /^(localhost|127\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.local)$/i.test(hostname);
  } catch {
    return false;
  }
}

function curlRequest(urlStr: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const args = ['-sS', '-i', '--location', '--connect-timeout', '5', '--max-time', '20', '-k'];
    const method = (options.method || 'GET').toUpperCase();
    args.push('-X', method);

    if (options.headers) {
      for (const [key, val] of Object.entries(options.headers)) {
        args.push('-H', `${key}: ${val}`);
      }
    }

    if (options.body && method !== 'GET' && method !== 'HEAD') {
      args.push('--data-raw', options.body);
    }

    args.push(urlStr);

    execFile('curl', args, { timeout: 25000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Network error: ${stderr?.trim() || error.message}`));
      }

      const separator = stdout.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
      const parts = stdout.split(separator);
      let lastHeaderIndex = 0;
      for (let i = 0; i < parts.length - 1; i++) {
        if (/^HTTP\/[0-9.]+\s+\d{3}/im.test(parts[i])) {
          lastHeaderIndex = i;
        }
      }
      const headerPart = parts[lastHeaderIndex] || '';
      const body = parts.slice(lastHeaderIndex + 1).join(separator);

      const statusMatch = headerPart.match(/^HTTP\/[0-9.]+\s+([0-9]+)/im);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

      resolve({
        status,
        ok: status >= 200 && status < 300,
        data: body,
        json: async () => JSON.parse(body),
        text: async () => body
      });
    });
  });
}

export function httpRequest(urlStr: string, options: HttpRequestOptions = {}, redirectsLeft = 3): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(urlStr);
      const isHttps = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;
      const timeoutMs = options.timeoutMs ?? 10000;

      const reqOptions: https.RequestOptions = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: (options.method || 'GET').toUpperCase(),
        headers: {
          'User-Agent': 'Gitler-App',
          ...options.headers
        },
        timeout: timeoutMs,
        rejectUnauthorized: false
      };

      const req = transport.request(reqOptions, res => {
        if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
          const redirectUrl = new URL(res.headers.location, urlStr).toString();
          return httpRequest(redirectUrl, options, redirectsLeft - 1).then(resolve, reject);
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          const status = res.statusCode || 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            data: body,
            json: async () => JSON.parse(body),
            text: async () => body
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Connection to ${parsed.host} timed out after ${timeoutMs}ms.`));
      });

      req.on('error', err => {
        // Fallback to native system curl if local network socket is blocked by macOS sandbox
        if (['EHOSTUNREACH', 'ENETUNREACH', 'EACCES', 'ECONNREFUSED'].includes((err as any)?.code)) {
          return curlRequest(urlStr, options).then(resolve, reject);
        }
        reject(err);
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function universalFetch(urlStr: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
  const electronNetFetch = (globalThis as any).__electronNetFetch;
  
  // 1. Electron Chromium net.fetch: Invokes macOS Network.framework, triggering the native system prompt if needed
  if (typeof electronNetFetch === 'function') {
    try {
      const fetchOpts: any = {
        method: (options.method || 'GET').toUpperCase(),
        headers: options.headers
      };
      if (options.body && fetchOpts.method !== 'GET' && fetchOpts.method !== 'HEAD') {
        fetchOpts.body = options.body;
      }
      const resp = await electronNetFetch(urlStr, fetchOpts);
      const text = await resp.text();
      return {
        status: resp.status,
        ok: resp.ok,
        data: text,
        json: async () => JSON.parse(text),
        text: async () => text
      };
    } catch (err: any) {
      console.warn('Electron net.fetch fell back to system network handler:', err?.message);
    }
  }

  // 2. Direct macOS curl for local addresses or socket-restricted environments
  if (process.platform === 'darwin' && isLocalAddress(urlStr)) {
    try {
      return await curlRequest(urlStr, options);
    } catch (curlErr: any) {
      console.warn('Direct curl local request failed, falling back to Node sockets:', curlErr?.message);
    }
  }

  // 3. Node standard http/https
  try {
    return await httpRequest(urlStr, options);
  } catch (err: any) {
    if (process.platform === 'darwin') {
      return await curlRequest(urlStr, options);
    }
    throw err;
  }
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

const CONFIG_DIR = path.join(os.homedir(), '.gitler');
const CONFIG_FILE = path.join(CONFIG_DIR, 'providers.json');

function ensureConfigDir(): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
  } catch {}
}

export function readProvidersConfig(): ProvidersConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

export function writeProvidersConfig(config: ProvidersConfig): void {
  ensureConfigDir();
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error('Failed to save providers config:', err);
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

export async function connectProvider(params: {
  provider: 'github' | 'gitlab' | 'gitea';
  token: string;
  instanceUrl?: string;
}): Promise<{
  success: boolean;
  account: Omit<ProviderAccount, 'token'>;
  sshSyncedMessage?: string;
}> {
  const { provider, token } = params;
  if (!token || !token.trim()) {
    throw new Error('Token is required.');
  }

  const cleanToken = token.trim().replace(/[\r\n\t\s]/g, '');
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
      const errMsg = netErr?.message || '';
      if (/192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|localhost|127\.0\.0\.1/i.test(instance) &&
          /(EHOSTUNREACH|ENETUNREACH|Failed to connect|Couldn't connect)/i.test(errMsg)) {
        throw new Error(`Cannot reach ${instance}. Check your network connection or verify the server address.`);
      }
      throw netErr;
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

    // Auto-sync Gitler's SSH key directly into Gitea
    try {
      const keyInfo = await getOrCreateGitlerSshKey(false);
      if (keyInfo.publicKey) {
        const keyPostRes = await universalFetch(`${instance}/api/v1/user/keys`, {
          method: 'POST',
          headers: {
            Authorization: `token ${cleanToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            title: 'gitler-app',
            key: keyInfo.publicKey,
            read_only: false
          })
        });

        if (keyPostRes.status === 201) {
          account.sshKeySynced = true;
          sshSyncedMessage = 'Gitler SSH key automatically installed into Gitea!';
        } else if (keyPostRes.status === 422) {
          account.sshKeySynced = true;
          sshSyncedMessage = 'Gitler SSH key already registered on Gitea.';
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

  const keyInfo = await getOrCreateGitlerSshKey(false);
  if (!keyInfo.publicKey) {
    throw new Error('No local Gitler SSH key found.');
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
        title: 'gitler-app',
        key: keyInfo.publicKey,
        read_only: false
      })
    });

    if (res.status === 201) {
      acc.sshKeySynced = true;
      writeProvidersConfig(config);
      return { success: true, message: 'SSH key uploaded to Gitea successfully!' };
    }
    if (res.status === 422) {
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
        title: 'gitler-app',
        key: keyInfo.publicKey
      })
    });

    if (res.status === 201) {
      acc.sshKeySynced = true;
      writeProvidersConfig(config);
      return { success: true, message: 'SSH key uploaded to GitLab successfully!' };
    }
    if (res.status === 400 || res.status === 422) {
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
        title: 'gitler-app',
        key: keyInfo.publicKey
      })
    });

    if (res.status === 201) {
      acc.sshKeySynced = true;
      writeProvidersConfig(config);
      return { success: true, message: 'SSH key uploaded to GitHub successfully!' };
    }
    if (res.status === 422) {
      acc.sshKeySynced = true;
      writeProvidersConfig(config);
      return { success: true, message: 'SSH key is already active in your GitHub account.' };
    }
    const errText = await res.text();
    throw new Error(`Failed to upload key to GitHub (${res.status}): ${errText}`);
  }

  throw new Error('Unsupported provider.');
}
