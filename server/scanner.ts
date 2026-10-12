import fs from 'fs';
import path from 'path';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.Trash',
  'Pods',
  'build',
  'dist',
  '.next',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  'Library',
  '.gemini',
  '.vscode',
  '.idea'
]);

export interface ScannedRepo {
  name: string;
  path: string;
  isRepo: boolean;
}

export async function scanForRepositories(rootDir: string, maxDepth = 3): Promise<{ repos: string[]; error?: string }> {
  const resolvedRoot = path.resolve(rootDir);
  const foundRepos: string[] = [];
  let scanError: string | undefined = undefined;

  // 1. Check if rootDir itself is already a git repository
  try {
    if (fs.existsSync(path.join(resolvedRoot, '.git'))) {
      return { repos: [resolvedRoot] };
    }
  } catch (err: any) {
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      return {
        repos: [],
        error: `macOS permission required to access "${path.basename(resolvedRoot)}". Please use "Open in Finder" to choose your project folder.`
      };
    }
  }

  // 2. Recursive scan
  async function walk(currentDir: string, currentDepth: number) {
    if (currentDepth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch (err: any) {
      if (currentDir === resolvedRoot && (err.code === 'EPERM' || err.code === 'EACCES')) {
        scanError = `macOS permission required to access "${path.basename(resolvedRoot)}". Please use "Open in Finder" to select a folder.`;
      }
      return;
    }

    const hasGit = entries.some(e => e.name === '.git');
    if (hasGit) {
      foundRepos.push(currentDir);
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        const fullSubPath = path.join(currentDir, entry.name);
        await walk(fullSubPath, currentDepth + 1);
      }
    }
  }

  await walk(resolvedRoot, 0);
  return { repos: foundRepos, error: scanError };
}
