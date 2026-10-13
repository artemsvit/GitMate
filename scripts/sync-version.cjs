const fs = require('node:fs');
const path = require('node:path');
const version = require('../package.json').version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A stable semantic version is required.');
for (const file of ['index.html', 'privacy.html', 'terms.html']) {
  const target = path.join(__dirname, '../landing', file);
  const content = fs.readFileSync(target, 'utf8').replace(/v\d+\.\d+\.\d+/g, `v${version}`).replace(/Gitler-\d+\.\d+\.\d+-arm64\.dmg/g, `Gitler-${version}-arm64.dmg`);
  fs.writeFileSync(target, content);
}
