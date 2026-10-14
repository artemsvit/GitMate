import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';

export function installAccessControl(app: Express, port: number) {
  const token = randomBytes(32).toString('hex');
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const origins = new Set([...hosts].map(host => `http://${host}`));
  if (process.env.NODE_ENV === 'development') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    if (!hosts.has(req.headers.host || '') ||
        (req.headers.origin !== undefined && !origins.has(req.headers.origin)) ||
        req.headers['sec-fetch-site'] === 'cross-site') {
      res.status(403).json({ error: 'Only the local Git Mate interface can access this server.' });
      return;
    }
    next();
  });
  app.get('/api/session', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ token });
  });
  app.use('/api', (req, res, next) => {
    const supplied = req.headers.authorization;
    const expected = `Bearer ${token}`;
    if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      res.status(401).json({ error: 'Git Mate session authorization required.' });
      return;
    }
    next();
  });
}

export class RepositoryAccess {
  private readonly repositories = new Set<string>();

  register(repoPath: string) {
    const canonical = fs.realpathSync(repoPath);
    if (!fs.existsSync(path.join(canonical, '.git'))) throw new Error('Not a Git repository.');
    this.repositories.add(canonical);
    return canonical;
  }

  resolve(repoPath: unknown) {
    if (typeof repoPath !== 'string' || !path.isAbsolute(repoPath)) throw new Error('A repository path is required.');
    const canonical = fs.realpathSync(repoPath);
    if (!this.repositories.has(canonical)) throw new Error('Select and scan this repository before accessing it.');
    return canonical;
  }
}

export function validateFilePath(repoPath: string, file: unknown): string {
  if (typeof file !== 'string' || !file || file.includes('\0') || path.isAbsolute(file)) {
    throw new Error('A relative file path is required.');
  }
  const relative = path.relative(repoPath, path.resolve(repoPath, file));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ||
      relative.split(path.sep).includes('.git')) throw new Error('File path is outside the working tree.');
  return file;
}
