import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Git Mate keeps accounts, models, and chats here. GITMATE_CONFIG_DIR overrides it for tests.
export const configDir = () => process.env.GITMATE_CONFIG_DIR || path.join(os.homedir(), '.gitmate');
export const sshKeyPaths = () => ({ ed25519: path.join(os.homedir(), '.ssh', 'gitmate_ed25519'), rsa: path.join(os.homedir(), '.ssh', 'gitmate_rsa') });

// Moves data from the earlier "Gitler" locations once. Existing new locations are never overwritten.
export function migrateLegacyStorage(home = os.homedir()) {
  // A custom data folder means a test or development run; it must never move the user's real data.
  if (process.env.GITMATE_CONFIG_DIR) return [];
  const moves: [string, string][] = [[path.join(home, '.gitler'), path.join(home, '.gitmate')]];
  for (const type of ['ed25519', 'rsa']) for (const suffix of ['', '.pub']) {
    moves.push([path.join(home, '.ssh', `gitler_${type}${suffix}`), path.join(home, '.ssh', `gitmate_${type}${suffix}`)]);
  }
  const moved: string[] = [];
  for (const [from, to] of moves) {
    try {
      if (fs.existsSync(from) && !fs.existsSync(to)) { fs.renameSync(from, to); moved.push(to); }
    } catch (error: any) { console.warn(`Could not move ${from}: ${error.message}`); }
  }
  return moved;
}
