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
  patchUUID(a, 'gitmate:arm64'); patchUUID(b, 'gitmate:arm64'); patchUUID(other, 'other-app:arm64');
  assert.deepEqual(a, b); assert.notDeepEqual(a.subarray(40), other.subarray(40));
  assert.deepEqual(a.subarray(0, 40), binary.subarray(0, 40));
});

test('interface network permissions are limited to the Git Mate origin', () => {
  const contents = { getURL: () => 'http://localhost:3001/' };
  assert.equal(trustedInterfacePermission(contents, 'local-network', 'http://localhost:3001/', 'http://localhost:3001'), true);
  assert.equal(trustedInterfacePermission(contents, 'local-network', 'https://unrelated.invalid', 'http://localhost:3001'), false);
  assert.equal(trustedInterfacePermission(contents, 'camera', 'http://localhost:3001/', 'http://localhost:3001'), false);
});

test('updater IPC guards its sender and requires download before installation', async () => {
  const { runInNewContext } = await import('node:vm'); const { EventEmitter } = await import('node:events'); const fs = await import('node:fs');
  const updater: any = new EventEmitter(); let installs = 0;
  updater.checkForUpdates = async () => updater.emit('update-available', { version: '1.1.0' });
  updater.downloadUpdate = async () => updater.emit('update-downloaded', { version: '1.1.0' }); updater.quitAndInstall = () => installs++;
  const module = { exports: {} as any }; runInNewContext(fs.readFileSync('electron/updates.cjs', 'utf8'), { module, require: () => ({ autoUpdater: updater }) });
  const handlers: Record<string, any> = {}; const expected = {};
  module.exports.installUpdates({ isPackaged: true, getVersion: () => '1.0.0' }, { handle: (name: string, handler: any) => { handlers[name] = handler; } }, (event: object) => { if (event !== expected) throw new Error('sender rejected'); }, () => ({ webContents: { send: () => {} } }));
  assert.throws(() => handlers['install-update']({}), /sender/); assert.throws(() => handlers['install-update'](expected), /Download/);
  assert.equal((await handlers['check-updates'](expected)).status, 'available'); assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, true);
  await handlers['download-update'](expected); handlers['install-update'](expected); assert.equal(installs, 1);
});

test('menu update check reports each result and installs only after consent', async () => {
  const { runInNewContext } = await import('node:vm'); const { EventEmitter } = await import('node:events'); const fs = await import('node:fs');
  const load = () => {
    const updater: any = new EventEmitter(); const calls = { downloads: 0, installs: 0 }; let latest = '1.1.0';
    updater.checkForUpdates = async () => latest ? updater.emit('update-available', { version: latest }) : updater.emit('update-not-available', {});
    updater.downloadUpdate = async () => { calls.downloads++; updater.emit('update-downloaded', { version: latest }); }; updater.quitAndInstall = () => calls.installs++;
    const answers: number[] = []; const shown: string[] = [];
    const dialog = { showMessageBox: async (_window: unknown, options: any) => { shown.push(options.message); return { response: answers.shift() ?? 0 }; } };
    const module = { exports: {} as any }; runInNewContext(fs.readFileSync('electron/updates.cjs', 'utf8'), { module, console, require: () => ({ autoUpdater: updater }) });
    const api = module.exports.installUpdates({ isPackaged: true, getVersion: () => '1.0.0' }, { handle: () => {} }, () => {}, () => ({ webContents: { send: () => {} } }), dialog);
    return { api, updater, calls, answers, shown, setLatest: (value: string) => { latest = value; } };
  };
  const declined = load(); declined.answers.push(1); await declined.api.checkInteractive();
  assert.deepEqual(declined.shown, ['Git Mate 1.1.0 is available.']); assert.equal(declined.calls.downloads, 0);
  const later = load(); later.answers.push(0, 1); await later.api.checkInteractive();
  assert.deepEqual(later.shown, ['Git Mate 1.1.0 is available.', 'Git Mate 1.1.0 is ready to install.']); assert.equal(later.calls.installs, 0);
  later.answers.push(0); await later.api.checkInteractive(); assert.equal(later.calls.installs, 1); assert.equal(later.calls.downloads, 1);
  const current = load(); current.setLatest(''); await current.api.checkInteractive(); assert.deepEqual(current.shown, ['You have the latest version.']);
  const launch = load(); launch.answers.push(1, 1); await launch.api.checkInBackground(); await launch.api.checkInBackground();
  assert.deepEqual(launch.shown, ['Git Mate 1.1.0 is available.'], 'a background check offers each version once');
  const quiet = load(); quiet.setLatest(''); await quiet.api.checkInBackground(); assert.deepEqual(quiet.shown, []);
  const offline = load(); offline.updater.checkForUpdates = async () => { throw new Error('offline'); }; await offline.api.checkInBackground(); assert.deepEqual(offline.shown, []);
  const failed = load(); failed.updater.checkForUpdates = async () => { failed.updater.emit('error', new Error('offline')); throw new Error('offline'); };
  await failed.api.checkInteractive(); assert.deepEqual(failed.shown, ['Git Mate could not check for updates.']);
});

test('application and Dock menus offer Check for Updates', async () => {
  const { runInNewContext } = await import('node:vm'); const fs = await import('node:fs');
  const module = { exports: {} as any }; runInNewContext(fs.readFileSync('electron/menu.cjs', 'utf8'), { module });
  let appMenu: any; let dockMenu: any; let checks = 0;
  const Menu = { buildFromTemplate: (template: any) => template, setApplicationMenu: (menu: any) => { appMenu = menu; } };
  module.exports.installMenu({ name: 'gitmate', dock: { setMenu: (menu: any) => { dockMenu = menu; } } }, Menu, () => checks++);
  const appItem = appMenu[0].submenu.find((item: any) => item.label === 'Check for Updates…'); const dockItem = dockMenu.find((item: any) => item.label === 'Check for Updates…');
  appItem.click(); dockItem.click(); assert.equal(checks, 2);
  assert.deepEqual([...appMenu[0].submenu].filter((item: any) => /Git Mate/i.test(item.label || '')).map((item: any) => item.label), ['About Git Mate', 'Hide Git Mate', 'Quit Git Mate']);
});

test('closing the last window quits Git Mate on macOS', async () => {
  const { runInNewContext } = await import('node:vm'); const fs = await import('node:fs'); const path = await import('node:path');
  const handlers: Record<string, () => void> = {}; let quits = 0;
  const electron = { app: { on: (name: string, handler: () => void) => { handlers[name] = handler; }, requestSingleInstanceLock: () => false, quit: () => { quits++; } }, ipcMain: { handle: () => {} } };
  const modules: Record<string, unknown> = { electron, 'node:path': path, './permissions.cjs': {}, 'node:child_process': { execFileSync: () => '' } };
  runInNewContext(fs.readFileSync('electron/main.cjs', 'utf8'), { require: (name: string) => modules[name], process: { env: { PATH: '', SSH_AUTH_SOCK: 'set' }, platform: 'darwin' }, __dirname: 'electron', console });
  const before = quits; handlers['window-all-closed'](); assert.equal(quits, before + 1);
});

test('release compatibility checks read actual Mach-O deployment targets, independently of the plist', () => {
  const { minimumMacOS } = require('../scripts/runtime-compatibility.cjs');
  const binary = Buffer.alloc(56); binary.writeUInt32LE(0xfeedfacf, 0); binary.writeUInt32LE(1, 16); binary.writeUInt32LE(0x32, 32); binary.writeUInt32LE(24, 36); binary.writeUInt32LE(1, 40); binary.writeUInt32LE(12 << 16, 44);
  assert.deepEqual(minimumMacOS(binary), [12,0,0]); binary.writeUInt32LE(13 << 16, 44); assert.deepEqual(minimumMacOS(binary), [13,0,0]);
});
