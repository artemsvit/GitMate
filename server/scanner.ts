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

export async function scanForRepositories(rootDir: string, maxDepth = 3): Promise<string[]> {
  const resolvedRoot = path.resolve(rootDir);
  const foundRepos: string[] = [];

  async function walk(currentDir: string, currentDepth: number) {
    if (currentDepth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      // Permission denied or unreadable folder
      return;
    }

    const hasGit = entries.some(e => e.name === '.git');
    if (hasGit) {
      foundRepos.push(currentDir);
      // Once we find a git repo, we don't scan deeper inside unless needed
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
  return foundRepos;
}
