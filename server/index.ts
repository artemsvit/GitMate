import { installCopilotRoutes } from './copilotRoutes';
import { getFilePreview } from './filePreview';
import { redactRemote } from './remoteSafety';
import express from 'express';
import { execFile } from 'node:child_process';
import { installAccessControl, RepositoryAccess } from './security';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Ensure standard macOS paths for git and ssh tools
const standardPaths = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
const existingPaths = (process.env.PATH || '').split(':');
process.env.PATH = Array.from(new Set([...standardPaths, ...existingPaths])).join(':');
const appRoot = typeof __dirname !== 'undefined'
  ? path.resolve(__dirname, '..')
  : process.cwd();
import { scanForRepositories } from './scanner';
import { migrateLegacyStorage } from './paths';
import {
  authorizeHttpsRemote,
  getRepoSummary,
  getRepoDetails,
  getDiff,
  stageFiles,
  unstageFiles,
  commit,
  push,
  pushDestinations,
  pull,
  fetchAll,
  checkout,
  setRemoteUrl,
  testRemoteConnection,
  getAuthDiagnostics,
  getOrCreateSshKey,
  getGlobalGitConfig,
  updateGlobalGitConfig,
  testHostSsh
} from './gitService';
import { detectLocalAI, generateCommitMessage } from './aiService';
import {
  testProviderConnection,
  getProvidersStatus,
  connectProvider,
  disconnectProvider,
  syncSshKeyToProvider
} from './providerService';

export const app = express();
const PORT = Number(process.env.PORT || 3001);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid server port.');
installAccessControl(app, PORT);
app.use(express.json({ limit: '1mb' }));
// Never return credentials embedded in legacy Git URLs or error output to the interface.
app.use((_req, res, next) => {
  const original = res.json.bind(res);
  const safe = (value: any): any => typeof value === 'string' ? redactRemote(value) : Array.isArray(value) ? value.map(safe) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safe(item)])) : value;
  res.json = ((value: any) => original(safe(value))) as typeof res.json;
  next();
});
const access = new RepositoryAccess();
app.use('/api', (req, res, next) => {
  const isSuggestion = req.path === '/ai/generate-commit';
  const supplied = req.method === 'GET' ? req.query.path : (isSuggestion ? req.body?.repoPath : req.body?.path);
  if ((req.path.startsWith('/repos/') && req.path !== '/repos/scan') || req.path === '/ai/generate-commit') {
    try {
      const canonical = access.resolve(supplied);
      if (req.method === 'GET') {
        // Express 5 query is a getter; routes read the canonical value from locals.
        res.locals.repoPath = canonical;
      } else if (isSuggestion) req.body.repoPath = canonical;
      else req.body.path = canonical;
    } catch (error: any) {
      res.status(403).json({ error: error.message });
      return;
    }
  }
  next();
});

installCopilotRoutes(app, access);

// Prevent aggressive browser/proxy caching for HTML and development assets
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// 1. System quick folder locations
app.get('/api/system/folders', (req, res) => {
  const home = os.homedir();
  const candidates = [
    { name: 'Desktop', path: path.join(home, 'Desktop') },
    { name: 'Developer', path: path.join(home, 'Developer') },
    { name: 'Projects', path: path.join(home, 'Projects') },
    { name: 'Documents', path: path.join(home, 'Documents') },
    { name: 'Home (~)', path: home }
  ];

  const existingFolders = candidates.filter(c => {
    try {
      return fs.existsSync(c.path);
    } catch {
      return false;
    }
  });

  res.json({ home, folders: existingFolders });
});

// 1b. Browse folder via native macOS Finder dialog
app.post('/api/system/browse-folder', async (req, res) => {
  const defaultPath = req.body?.defaultPath;
  if (process.platform === 'darwin') {
    try {
      if (defaultPath !== undefined && (typeof defaultPath !== 'string' || !path.isAbsolute(defaultPath))) {
        return res.status(400).json({ error: 'defaultPath must be an absolute path.' });
      }
      const script = 'on run argv\n' +
        (defaultPath ? 'return POSIX path of (choose folder with prompt "Select folder containing Git repositories:" default location POSIX file (item 1 of argv))\n' :
          'return POSIX path of (choose folder with prompt "Select folder containing Git repositories:")\n') + 'end run';
      execFile('osascript', ['-e', script, ...(defaultPath ? [defaultPath] : [])], (error, stdout) => {
        if (error) return res.json({ canceled: true, path: null });
        res.json({ canceled: false, path: stdout.trim().replace(/\/$/, '') });
      });
      return;
    } catch {
      // fallback
    }
  }
  res.json({ canceled: true, path: null });
});

// 1c. Open macOS Local Network Privacy pane
app.post('/api/system/open-local-network-settings', (_req, res) => {
  if (process.platform === 'darwin') {
    execFile('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork'], () => {});
  }
  res.json({ success: true });
});

// 2. Scan folder for git repositories
app.post('/api/repos/scan', async (req, res) => {
  try {
    const { rootDir, maxDepth = 3 } = req.body;
    if (typeof rootDir !== 'string' || !path.isAbsolute(rootDir) || !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 5) {
      return res.status(400).json({ error: 'rootDir is required' });
    }

    const { repos: repoPaths, error: scanError } = await scanForRepositories(rootDir, Number(maxDepth));
    
    // Fetch summary for all found repos concurrently
    const summaries = await Promise.all(
      repoPaths.map(async p => {
        try {
          return await getRepoSummary(access.register(p));
        } catch {
          return null;
        }
      })
    );

    const validSummaries = summaries.filter(Boolean);
    res.json({
      rootDir,
      count: validSummaries.length,
      repositories: validSummaries,
      error: scanError
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Scan failed' });
  }
});

// 3. Get repository details
app.get('/api/repos/details', async (req, res) => {
  try {
    const repoPath = res.locals.repoPath as string;
    if (!repoPath) {
      return res.status(400).json({ error: 'path is required' });
    }

    const details = await getRepoDetails(repoPath);
    res.json(details);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get repo details' });
  }
});

// 4. Get diff for file or entire repo
app.get('/api/repos/diff', async (req, res) => {
  try {
    const repoPath = res.locals.repoPath as string;
    const filepath = req.query.file as string | undefined;
    const staged = req.query.staged === 'true';

    if (!repoPath) {
      return res.status(400).json({ error: 'path is required' });
    }

    const diff = await getDiff(repoPath, filepath, staged);
    res.json({ diff, staged, filepath: filepath || 'all' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get diff' });
  }
});

app.get('/api/repos/preview', async (req, res) => {
  try { res.json(await getFilePreview(res.locals.repoPath, req.query.file as string, req.query.staged === 'true')); }
  catch (error: any) { res.status(400).json({ error: error.code === 'ENOENT' ? 'The selected file no longer exists in the working tree.' : error.message }); }
});

app.post('/api/repos/remotes/authorize', async (req, res) => {
  try {
    const { path: repoPath, remoteName, provider, token, direction = 'fetch', pushIndex = 0 } = req.body;
    const message = await authorizeHttpsRemote(repoPath, remoteName, provider, token, direction, pushIndex);
    res.json({ success: true, message, updated: await getRepoDetails(repoPath) });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

// 5. Stage files
app.post('/api/repos/stage', async (req, res) => {
  try {
    const { path: repoPath, files } = req.body;
    if (!repoPath) return res.status(400).json({ error: 'path is required' });

    await stageFiles(repoPath, files);
    const updated = await getRepoDetails(repoPath);
    res.json({ success: true, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Stage failed' });
  }
});

// 6. Unstage files
app.post('/api/repos/unstage', async (req, res) => {
  try {
    const { path: repoPath, files } = req.body;
    if (!repoPath) return res.status(400).json({ error: 'path is required' });

    await unstageFiles(repoPath, files);
    const updated = await getRepoDetails(repoPath);
    res.json({ success: true, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unstage failed' });
  }
});

// 7. Commit
app.post('/api/repos/commit', async (req, res) => {
  try {
    const { path: repoPath, message } = req.body;
    if (!repoPath || !message) {
      return res.status(400).json({ error: 'path and message are required' });
    }

    const commitHash = await commit(repoPath, message);
    const updated = await getRepoDetails(repoPath);
    res.json({ success: true, commitHash, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Commit failed' });
  }
});

// 8. Push
app.post('/api/repos/push', async (req, res) => {
  try {
    const { path: repoPath, remote, branch, pushIndex, destinations, expectedCommit } = req.body;
    if (!repoPath) return res.status(400).json({ error: 'path is required' });

    if (destinations !== undefined) {
      const result = await pushDestinations(repoPath, destinations, expectedCommit);
      const updated = await getRepoDetails(repoPath);
      return res.json({ ...result, updated });
    }
    const output = await push(repoPath, remote, branch, pushIndex, expectedCommit);
    const updated = await getRepoDetails(repoPath);
    res.json({ success: true, output, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Push failed' });
  }
});

// 9. Pull
app.post('/api/repos/pull', async (req, res) => {
  try {
    const { path: repoPath, remote, branch } = req.body;
    if (!repoPath) return res.status(400).json({ error: 'path is required' });

    const output = await pull(repoPath, remote, branch);
    const updated = await getRepoDetails(repoPath);
    res.json({ success: true, output, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Pull failed' });
  }
});

// 10. Fetch
app.post('/api/repos/fetch', async (req, res) => {
  try {
    const { path: repoPath, remote } = req.body;
    if (!repoPath) return res.status(400).json({ error: 'path is required' });

    const output = await fetchAll(repoPath, remote);
    const updated = await getRepoDetails(repoPath);
    res.json({ success: true, output, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Fetch failed' });
  }
});

// 11. Switch / Create Branch
app.post('/api/repos/checkout', async (req, res) => {
  try {
    const { path: repoPath, branch, createNew = false } = req.body;
    if (!repoPath || !branch) {
      return res.status(400).json({ error: 'path and branch are required' });
    }

    const output = await checkout(repoPath, branch, createNew);
    const updated = await getRepoDetails(repoPath);
    res.json({ success: true, output, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Checkout failed' });
  }
});

// 11b. Remote Auth Diagnostics (SSH, GitHub CLI, Credentials)
app.get('/api/auth/diagnostics', async (_req, res) => {
  try {
    const diag = await getAuthDiagnostics();
    res.json(diag);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11c. Update Remote URL (e.g. switch between HTTPS and SSH)
app.post('/api/repos/remotes/update-url', async (req, res) => {
  try {
    const { path: repoPath, remoteName = 'origin', newUrl, direction = 'fetch', pushIndex = 0 } = req.body;
    if (!repoPath || !newUrl) {
      return res.status(400).json({ error: 'path and newUrl are required' });
    }
    const output = await setRemoteUrl(repoPath, remoteName, newUrl, direction, pushIndex);
    const updated = await getRepoDetails(repoPath);
    res.json({ success: true, output, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update remote URL' });
  }
});

// 11d. Test Remote Connection
app.post('/api/repos/remotes/test', async (req, res) => {
  try {
    const { path: repoPath, remoteName = 'origin', direction = 'fetch', pushIndex = 0 } = req.body;
    if (!repoPath) return res.status(400).json({ error: 'path is required' });
    const result = await testRemoteConnection(repoPath, remoteName, direction, pushIndex);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Test connection failed' });
  }
});

// 11e. Get or create dedicated Git Mate SSH Key
app.get('/api/auth/ssh-key', async (_req, res) => {
  try {
    const keyInfo = await getOrCreateSshKey(false);
    res.json(keyInfo);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11f. Regenerate dedicated Git Mate SSH Key
app.post('/api/auth/ssh-key/regenerate', async (req, res) => {
  try {
    const keyType = (req.body?.keyType === 'rsa' ? 'rsa' : 'ed25519') as 'ed25519' | 'rsa';
    const keyInfo = await getOrCreateSshKey(true, keyType);
    res.json(keyInfo);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11g. Get Global Git Config
app.get('/api/settings/git-config', async (_req, res) => {
  try {
    const config = await getGlobalGitConfig();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11h. Update Global Git Config
app.post('/api/settings/git-config', async (req, res) => {
  try {
    await updateGlobalGitConfig(req.body);
    const updated = await getGlobalGitConfig();
    res.json({ success: true, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11i. Test Host SSH
app.post('/api/settings/test-host', async (req, res) => {
  try {
    const { host, port = 22 } = req.body;
    if (!host) return res.status(400).json({ error: 'host is required' });
    const result = await testHostSsh(host, Number(port));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11j. Providers management (GitHub, GitLab, Gitea)
app.get('/api/auth/providers', async (_req, res) => {
  try {
    const status = await getProvidersStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/providers/test', async (req, res) => {
  try { res.json(await testProviderConnection(req.body?.provider, req.body?.instanceUrl)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

app.post('/api/auth/providers/connect', async (req, res) => {
  try {
    const { provider, token, instanceUrl } = req.body;
    if (!provider || !token) {
      return res.status(400).json({ error: 'provider and token are required' });
    }
    const result = await connectProvider({ provider, token, instanceUrl });
    res.json(result);
  } catch (err: any) {
    const detail = err.cause ? (err.cause.message || err.cause.code || String(err.cause)) : '';
    const message = detail ? `${err.message} (${detail})` : (err.message || 'Connection failed');
    res.status(400).json({ error: message });
  }
});

app.post('/api/auth/providers/disconnect', async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider is required' });
    await disconnectProvider(provider);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/providers/sync-ssh-key', async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider is required' });
    const result = await syncSshKeyToProvider(provider);
    res.json(result);
  } catch (err: any) {
    const detail = err.cause ? (err.cause.message || err.cause.code || String(err.cause)) : '';
    const message = detail ? `${err.message} (${detail})` : (err.message || 'Sync failed');
    res.status(400).json({ error: message });
  }
});

// 12. Local AI status
app.get('/api/ai/status', async (req, res) => {
  try {
    const status = await detectLocalAI(req.query.mode as string);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI detection failed' });
  }
});

// 13. AI generate commit message
app.post('/api/ai/generate-commit', async (req, res) => {
  try {
    const { repoPath, provider, model, endpoint } = req.body;
    if (!repoPath) {
      return res.status(400).json({ error: 'repoPath is required' });
    }

    const details = await getRepoDetails(repoPath);
    // Suggestions describe only the index, which is what Git will commit.
    const diff = await getDiff(repoPath, undefined, true);
    const changedFiles = details.files.filter(f => f.isStaged).map(f => f.path);
    if (!changedFiles.length) {
      return res.status(400).json({ error: 'Stage the changes you want to commit before generating a message.' });
    }

    const result = await generateCommitMessage({
      diff,
      repoName: details.name,
      changedFiles,
      provider,
      model,
      endpoint,
      recentSubjects: details.recentCommits.map((commit: any) => String(commit.message || '').split('\n')[0]).slice(0, 8)
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate commit' });
  }
});

// Serve promotional landing page
const landingCandidates = [
  path.join(appRoot, 'landing'),
  path.resolve('landing')
];
const landingPath = landingCandidates.find(p => fs.existsSync(p)) || path.resolve('landing');
if (fs.existsSync(landingPath)) {
  app.use('/landing', express.static(landingPath));
}

// Serve frontend static build if available
const distCandidates = [
  path.join(appRoot, 'dist'),
  path.resolve('dist')
];
const distPath = distCandidates.find(p => fs.existsSync(p)) || path.resolve('dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get(/^(?!\/api|\/landing).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

export function startServer() {
  // Move data from the earlier Gitler locations before any request reads it.
  migrateLegacyStorage();
  return app.listen(PORT, '127.0.0.1', () => {
    console.log(`Git Mate is running at http://127.0.0.1:${PORT}`);
  });
}
