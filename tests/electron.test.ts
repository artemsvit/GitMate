import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { patchUUID } = require('../scripts/unique-app-uuid.cjs');
const { trustedInterfacePermission } = require('../electron/permissions.cjs');

test('packaged executable UUID is unique per app and stable across rebuilds', () => {
  const binary = Buffer.alloc(56);
  binary.writeUInt32LE(0xfeedfacf, 0); binary.writeUInt32LE(1, 16);
  binary.writeUInt32LE(0x1b, 32); binary.writeUInt32LE(24, 36);
  const a = Buffer.from(binary), b = Buffer.from(binary), other = Buffer.from(binary);
  patchUUID(a, 'gitler:arm64'); patchUUID(b, 'gitler:arm64'); patchUUID(other, 'other-app:arm64');
  assert.deepEqual(a, b); assert.notDeepEqual(a.subarray(40), other.subarray(40));
  assert.deepEqual(a.subarray(0, 40), binary.subarray(0, 40));
});

test('interface network permissions are limited to the Gitler origin', () => {
  const contents = { getURL: () => 'http://localhost:3001/' };
  assert.equal(trustedInterfacePermission(contents, 'local-network', 'http://localhost:3001/', 'http://localhost:3001'), true);
  assert.equal(trustedInterfacePermission(contents, 'local-network', 'https://unrelated.invalid', 'http://localhost:3001'), false);
  assert.equal(trustedInterfacePermission(contents, 'camera', 'http://localhost:3001/', 'http://localhost:3001'), false);
});
