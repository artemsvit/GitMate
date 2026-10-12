import express from 'express';
import cors from 'cors';
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
import {
  getRepoSummary,
  getRepoDetails,
  getDiff,
  stageFiles,
  unstageFiles,
  commit,
  push,
  pull,
  fetchAll,
  checkout,
  setRemoteUrl,
  testRemoteConnection,
  getAuthDiagnostics,
  getOrCreateGitlerSshKey,
  getGlobalGitConfig,
  updateGlobalGitConfig,
  testHostSsh
} from './gitService';
import { detectLocalAI, generateCommitMessage } from './aiService';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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
      const { exec } = await import('child_process');
      const defaultClause = defaultPath ? ` default location POSIX file "${defaultPath.replace(/"/g, '\\"')}"` : '';
      exec(
        `osascript -e 'POSIX path of (choose folder with prompt "Select folder containing Git repositories:"${defaultClause})'`,
        (error, stdout) => {
          if (error) {
            return res.json({ canceled: true, path: null });
          }
          const selected = stdout.trim().replace(/\/$/, '');
          res.json({ canceled: false, path: selected });
        }
      );
      return;
    } catch {
      // fallback
    }
  }
  res.json({ canceled: true, path: null });
});

// 2. Scan folder for git repositories
app.post('/api/repos/scan', async (req, res) => {
  try {
    const { rootDir, maxDepth = 3 } = req.body;
    if (!rootDir) {
      return res.status(400).json({ error: 'rootDir is required' });
    }

    const { repos: repoPaths, error: scanError } = await scanForRepositories(rootDir, Number(maxDepth));
    
    // Fetch summary for all found repos concurrently
    const summaries = await Promise.all(
      repoPaths.map(async p => {
        try {
          return await getRepoSummary(p);
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
    const repoPath = req.query.path as string;
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
    const repoPath = req.query.path as string;
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
    const { path: repoPath, remote = 'origin', branch } = req.body;
    if (!repoPath) return res.status(400).json({ error: 'path is required' });

    const output = await push(repoPath, remote, branch);
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
    const { path: repoPath } = req.body;
    if (!repoPath) return res.status(400).json({ error: 'path is required' });

    const output = await fetchAll(repoPath);
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
    const { path: repoPath, remoteName = 'origin', newUrl } = req.body;
    if (!repoPath || !newUrl) {
      return res.status(400).json({ error: 'path and newUrl are required' });
    }
    const output = await setRemoteUrl(repoPath, remoteName, newUrl);
    const updated = await getRepoDetails(repoPath);
    res.json({ success: true, output, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update remote URL' });
  }
});

// 11d. Test Remote Connection
app.post('/api/repos/remotes/test', async (req, res) => {
  try {
    const { path: repoPath, remoteName = 'origin' } = req.body;
    if (!repoPath) return res.status(400).json({ error: 'path is required' });
    const result = await testRemoteConnection(repoPath, remoteName);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Test connection failed' });
  }
});

// 11e. Get or create dedicated Gitler SSH Key
app.get('/api/auth/gitler-key', async (_req, res) => {
  try {
    const keyInfo = await getOrCreateGitlerSshKey(false);
    res.json(keyInfo);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11f. Regenerate dedicated Gitler SSH Key
app.post('/api/auth/gitler-key/regenerate', async (_req, res) => {
  try {
    const keyInfo = await getOrCreateGitlerSshKey(true);
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
    // Prefer staged diff, or unstaged if nothing staged
    let diff = await getDiff(repoPath, undefined, true);
    let changedFiles = details.files.filter(f => f.isStaged).map(f => f.path);

    if (!diff || diff.trim() === '') {
      diff = await getDiff(repoPath, undefined, false);
      changedFiles = details.files.map(f => f.path);
    }

    if (!diff || diff.trim() === '') {
      return res.json({
        message: 'chore: no changes detected',
        source: 'smart-heuristic',
        provider: 'None',
        model: 'None'
      });
    }

    const result = await generateCommitMessage({
      diff,
      repoName: details.name,
      changedFiles,
      provider,
      model,
      endpoint
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

app.listen(PORT, () => {
  console.log(`Gitler is running at http://localhost:${PORT}`);
});
