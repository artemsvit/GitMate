import fs from 'node:fs/promises';
import path from 'node:path';
import { getGit } from './gitService';
import { validateFilePath } from './security';
const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp' };
const LIMIT = 10 * 1024 * 1024;
export async function getFilePreview(repoPath: string, file: string, staged = false) {
  validateFilePath(repoPath, file);
  const mime = types[path.extname(file).toLowerCase()];
  if (!mime) throw new Error('This file type has no image preview.');
  let content: Buffer;
  if (staged) {
    const git = getGit(repoPath);
    const size = Number((await git.raw(['cat-file', '-s', `:${file}`])).trim());
    if (size > LIMIT) throw new Error('Image preview is limited to 10 MiB.');
    content = await git.binaryCatFile(['blob', `:${file}`]);
  } else {
    const target = await fs.realpath(path.join(repoPath, file));
    validateFilePath(repoPath, path.relative(await fs.realpath(repoPath), target));
    const handle = await fs.open(target, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > LIMIT) throw new Error('Image preview is limited to regular files up to 10 MiB.');
      const buffer = Buffer.alloc(LIMIT + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > LIMIT) throw new Error('Image preview is limited to 10 MiB.');
      content = buffer.subarray(0, bytesRead);
    } finally { await handle.close(); }
  }
  return { mime, size: content.length, dataUrl: `data:${mime};base64,${content.toString('base64')}` };
}
