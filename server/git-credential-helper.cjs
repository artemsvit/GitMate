// Git invokes this helper over stdin/stdout. Tokens never enter command arguments or remote URLs.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
function credentialFor(input, config) {
  const fields = Object.fromEntries(input.trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  if (!['http', 'https'].includes(fields.protocol) || !fields.host) return null;
  const origin = `${fields.protocol}://${fields.host}`;
  for (const [provider, account] of Object.entries(config)) {
    if (!account?.connected || typeof account.token !== 'string' || !account.token || /\s/.test(account.token)) continue;
    try {
      const instance = new URL(account.instanceUrl);
      const prefix = instance.pathname.replace(/^\/+|\/+$/g, '');
      if (instance.origin !== origin || (prefix && !(fields.path || '').startsWith(prefix + '/'))) continue;
      const username = provider === 'github' ? 'x-access-token' : provider === 'gitlab' ? 'oauth2' : account.username || 'git';
      if (typeof username !== 'string' || /[\r\n\0]/.test(username)) return null;
      return { username, password: account.token };
    } catch {}
  }
  if (origin === 'https://github.com' && config.github === undefined) {
    try {
      const password = execFileSync('gh', ['auth', 'token', '--hostname', 'github.com'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (password && !/\s/.test(password)) return { username: 'x-access-token', password };
    } catch {}
  }
  return null;
}
if (require.main === module) {
  try {
    const input = fs.readFileSync(0, 'utf8');
    if (process.argv[2] !== 'get') process.exit(0);
    const configPath = path.join(process.env.GITMATE_CONFIG_DIR || path.join(os.homedir(), '.gitmate'), 'providers.json');
    const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
    const credential = credentialFor(input, config);
    if (credential) process.stdout.write(`username=${credential.username}\npassword=${credential.password}\n\n`);
  } catch { /* A helper failure must not expose secrets. Git reports authentication failure. */ }
}
module.exports = { credentialFor };
