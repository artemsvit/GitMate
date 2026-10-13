const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const version = require('../package.json').version;
const root = path.resolve('release'); const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'gitler-release-validation-'));
function check(bundle) {
  const plistVersion = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(bundle, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  if (plistVersion !== version) throw new Error('Bundle version mismatch.');
  execFileSync('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' });
  execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=2', bundle], { stdio: 'inherit' });
  execFileSync('xcrun', ['stapler', 'validate', bundle], { stdio: 'inherit' });
}
try {
  execFileSync('ditto', ['-x', '-k', path.join(root, `Gitler-${version}-arm64-mac.zip`), path.join(tmp, 'zip')]); check(path.join(tmp, 'zip/Gitler.app'));
  const mount = path.join(tmp, 'dmg'); fs.mkdirSync(mount);
  execFileSync('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, path.join(root, `Gitler-${version}-arm64.dmg`)], { stdio: 'inherit' });
  try { check(path.join(mount, 'Gitler.app')); } finally { execFileSync('hdiutil', ['detach', mount], { stdio: 'inherit' }); }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
