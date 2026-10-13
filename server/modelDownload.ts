import fs from 'node:fs';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
export async function hashFile(file: string) {
  const hash = crypto.createHash('sha256'); for await (const chunk of fs.createReadStream(file)) hash.update(chunk); return hash.digest('hex');
}
export async function downloadArtifact(spec: { url: string; size: number; sha256: string }, file: string, signal: AbortSignal, progress: (bytes: number, verifying: boolean) => void) {
  const partial = file + '.partial'; let offset = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
  if (offset >= spec.size) {
    progress(offset, true);
    if (offset === spec.size && await hashFile(partial) === spec.sha256) { signal.throwIfAborted(); fs.renameSync(partial, file); return; }
    fs.rmSync(partial); offset = 0;
  }
  const response = await fetch(spec.url, { signal, headers: offset ? { Range: `bytes=${offset}-` } : {} });
  if (!response.ok || !response.body) throw new Error(`Model download failed (HTTP ${response.status}).`);
  if (offset && response.status !== 206) offset = 0;
  if (response.status === 206 && !response.headers.get('content-range')?.startsWith(`bytes ${offset}-`)) throw new Error('Invalid resumed model download.');
  let received = offset; const source = Readable.fromWeb(response.body as any);
  source.on('data', chunk => { received += chunk.length; progress(received, false); if (received > spec.size) source.destroy(new Error('Downloaded model exceeds its expected size.')); });
  await pipeline(source, fs.createWriteStream(partial, { flags: offset ? 'a' : 'w', mode: 0o600 }), { signal });
  progress(received, true);
  if (received !== spec.size || await hashFile(partial) !== spec.sha256) { fs.rmSync(partial, { force: true }); throw new Error('Model checksum verification failed. Retry the download.'); }
  signal.throwIfAborted(); fs.renameSync(partial, file);
}
