const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
function patchUUID(buffer, identity) {
  if (buffer.readUInt32LE(0) !== 0xfeedfacf) throw new Error('Expected a 64-bit macOS executable.');
  const uuid = createHash('sha256').update(identity).digest().subarray(0, 16);
  uuid[6] = (uuid[6] & 15) | 0x50; uuid[8] = (uuid[8] & 63) | 0x80;
  const count = buffer.readUInt32LE(16);
  let offset = 32;
  for (let i = 0; i < count; i++) {
    const command = buffer.readUInt32LE(offset), size = buffer.readUInt32LE(offset + 4);
    if (size < 8 || offset + size > buffer.length) throw new Error('Invalid Mach-O load command.');
    if (command === 0x1b && size === 24) { uuid.copy(buffer, offset + 8); return; }
    offset += size;
  }
  throw new Error('The executable has no UUID load command.');
}
module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  const info = context.packager.appInfo;
  require('./runtime-compatibility.cjs').validateRuntime(path.join(context.appOutDir, `${info.productFilename}.app`));
  const file = path.join(context.appOutDir, `${info.productFilename}.app`, 'Contents', 'MacOS', info.productFilename);
  const binary = fs.readFileSync(file);
  // Stable per app and architecture; Electron's shared UUID must not identify multiple apps.
  patchUUID(binary, `${info.id}:${context.arch}:gitler-main-executable`);
  fs.writeFileSync(file, binary);
};
module.exports.patchUUID = patchUUID;
