const fs = require('node:fs');
const path = require('node:path');
function minimumMacOS(binary) {
  if (binary.readUInt32LE(0) !== 0xfeedfacf) throw new Error('Expected an arm64 macOS executable.');
  let offset = 32;
  for (let index = 0; index < binary.readUInt32LE(16); index++) {
    const command = binary.readUInt32LE(offset), size = binary.readUInt32LE(offset + 4);
    if (size < 8 || offset + size > binary.length) throw new Error('Invalid macOS load command.');
    if (command === 0x32 || command === 0x24) {
      const value = binary.readUInt32LE(offset + (command === 0x32 ? 12 : 8));
      return [value >>> 16, (value >>> 8) & 255, value & 255];
    }
    offset += size;
  }
  throw new Error('macOS minimum version is missing.');
}
function validateRuntime(bundle) {
  for (const relative of [`Contents/MacOS/${path.basename(bundle, '.app')}`, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework']) {
    const version = minimumMacOS(fs.readFileSync(path.join(bundle, relative)));
    if (version[0] > 12 || (version[0] === 12 && (version[1] > 0 || version[2] > 0))) throw new Error(`Runtime requires macOS ${version.join('.')}; Git Mate promises macOS 12.0.`);
  }
}
module.exports = { minimumMacOS, validateRuntime };
