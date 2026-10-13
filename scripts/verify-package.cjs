const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const release = path.resolve('release');
const bundles = fs.readdirSync(release).filter(name => name.startsWith('mac')).flatMap(name => {
  const dir = path.join(release, name);
  return fs.readdirSync(dir).filter(file => file.endsWith('.app')).map(file => path.join(dir, file));
});
if (!bundles.length) throw new Error('No packaged macOS app found.');
for (const bundle of bundles) {
  require('./runtime-compatibility.cjs').validateRuntime(bundle);
  const archive = path.join(bundle, 'Contents/Resources/app.asar');
  const required = ['electron/main.cjs', 'electron/zoom.cjs', 'electron/updates.cjs', 'electron/permissions.cjs', 'electron/preload.cjs', 'server/git-credential-helper.cjs', 'dist/index.html', 'server/index.cjs',
    'node_modules/node-llama-cpp/package.json', 'node_modules/electron-updater/package.json', 'node_modules/simple-git/package.json'];
  for (const file of required) asar.statFile(archive, file);
  const manifest = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  if (!manifest.dependencies['electron-updater']) throw new Error('Updater must be a runtime dependency.');
  if (manifest.version !== require('../package.json').version) throw new Error('Packaged version mismatch.');
  const native = path.join(bundle, 'Contents/Resources/app.asar.unpacked/node_modules/@node-llama-cpp/mac-arm64-metal/bins');
  if (!fs.existsSync(native)) throw new Error('Packaged Copilot Metal runtime is missing.');
  console.log(`Verified runtime assets and updater: ${bundle}`);
}
