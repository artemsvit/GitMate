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

// Loads electron/updates.cjs with a fake updater. With a window the in-app update window opens; without one, native dialogs ask.
async function loadUpdater(options: { window: boolean; latest?: string; notes?: unknown }) {
  const { runInNewContext } = await import('node:vm'); const { EventEmitter } = await import('node:events'); const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmate-updates-'));
  const updater: any = new EventEmitter(); const calls = { downloads: 0, installs: 0 }; let latest = options.latest ?? '1.1.0';
  updater.checkForUpdates = async () => latest ? updater.emit('update-available', { version: latest, releaseNotes: options.notes ?? '<p>Notes</p>', releaseDate: '2026-10-14T00:00:00Z' }) : updater.emit('update-not-available', {});
  updater.downloadUpdate = async () => { calls.downloads++; updater.emit('download-progress', { percent: 50, transferred: 5, total: 10, bytesPerSecond: 2 }); updater.emit('update-downloaded', { version: latest }); };
  updater.quitAndInstall = () => calls.installs++;
  const answers: number[] = []; const shown: string[] = []; const prompts: any[] = []; const handlers: Record<string, any> = {};
  const dialog = { showMessageBox: async (_window: unknown, dialogOptions: any) => { shown.push((dialogOptions || _window).message); return { response: answers.shift() ?? 0 }; } };
  const window = { webContents: { send: (channel: string, value: any) => { if (channel === 'update-prompt') prompts.push(value); } } };
  const module = { exports: {} as any }; runInNewContext(fs.readFileSync('electron/updates.cjs', 'utf8'), { module, console, require: (name: string) => name === 'electron-updater' ? { autoUpdater: updater } : require(name) });
  const app = { isPackaged: true, getVersion: () => '1.0.0', getPath: () => userData };
  const api = module.exports.installUpdates(app, { handle: (name: string, handler: any) => { handlers[name] = handler; } }, () => {}, () => options.window ? window : null, dialog);
  return { api, updater, calls, answers, shown, prompts, handlers, userData, normalizeNotes: module.exports.normalizeNotes, setLatest: (value: string) => { latest = value; } };
}

test('updater IPC guards its sender and requires download before installation', async () => {
  const { runInNewContext } = await import('node:vm'); const { EventEmitter } = await import('node:events'); const fs = await import('node:fs'); const os = await import('node:os');
  const updater: any = new EventEmitter(); let installs = 0;
  updater.checkForUpdates = async () => updater.emit('update-available', { version: '1.1.0' });
  updater.downloadUpdate = async () => updater.emit('update-downloaded', { version: '1.1.0' }); updater.quitAndInstall = () => installs++;
  const module = { exports: {} as any }; runInNewContext(fs.readFileSync('electron/updates.cjs', 'utf8'), { module, require: (name: string) => name === 'electron-updater' ? { autoUpdater: updater } : require(name) });
  const handlers: Record<string, any> = {}; const expected = {};
  module.exports.installUpdates({ isPackaged: true, getVersion: () => '1.0.0', getPath: () => os.tmpdir() }, { handle: (name: string, handler: any) => { handlers[name] = handler; } }, (event: object) => { if (event !== expected) throw new Error('sender rejected'); }, () => ({ webContents: { send: () => {} } }));
  assert.throws(() => handlers['install-update']({}), /sender/); assert.throws(() => handlers['install-update'](expected), /Download/);
  assert.equal((await handlers['check-updates'](expected)).status, 'available'); assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, true);
  await handlers['download-update'](expected); handlers['install-update'](expected); assert.equal(installs, 1);
});

test('without a window, native dialogs report each result and install only after consent', async () => {
  const declined = await loadUpdater({ window: false }); declined.answers.push(1); await declined.api.checkInteractive();
  assert.deepEqual(declined.shown, ['Git Mate 1.1.0 is available.']); assert.equal(declined.calls.downloads, 0);
  const later = await loadUpdater({ window: false }); later.answers.push(0, 1); await later.api.checkInteractive();
  assert.deepEqual(later.shown, ['Git Mate 1.1.0 is available.', 'Git Mate 1.1.0 is ready to install.']); assert.equal(later.calls.installs, 0);
  later.answers.push(0); await later.api.checkInteractive(); assert.equal(later.calls.installs, 1); assert.equal(later.calls.downloads, 1);
  const current = await loadUpdater({ window: false, latest: '' }); await current.api.checkInteractive(); assert.deepEqual(current.shown, ['You have the latest version.']);
  const failed = await loadUpdater({ window: false }); failed.updater.checkForUpdates = async () => { failed.updater.emit('error', new Error('offline')); throw new Error('offline'); };
  await failed.api.checkInteractive(); assert.deepEqual(failed.shown, ['Git Mate could not check for updates.']);
});

test('with a window, the update window shows notes, progress, skip, and automatic downloads', async () => {
  const menu = await loadUpdater({ window: true }); await menu.api.checkInteractive();
  assert.deepEqual(menu.shown, [], 'no native dialog when the app window is open');
  const offer = menu.prompts.at(-1); assert.equal(offer.status, 'available'); assert.equal(offer.version, '1.1.0'); assert.equal(offer.current, '1.0.0'); assert.equal(offer.releaseNotes, '<p>Notes</p>');
  await menu.handlers['download-update']({}); const state = await menu.handlers['get-update-state']({}); assert.equal(state.status, 'downloaded');

  const skip = await loadUpdater({ window: true }); await skip.api.checkInBackground(); assert.equal(skip.prompts.length, 1);
  await skip.handlers['skip-update']({});
  const fs = await import('node:fs');
  assert.equal(JSON.parse(fs.readFileSync(`${skip.userData}/updates.json`, 'utf8')).skipped, '1.1.0', 'Skip This Version is saved');

  const once = await loadUpdater({ window: true }); await once.api.checkInBackground(); await once.api.checkInBackground();
  assert.equal(once.prompts.length, 1, 'a background check offers each version once');
  const quiet = await loadUpdater({ window: true, latest: '' }); await quiet.api.checkInBackground(); assert.equal(quiet.prompts.length, 0);

  const auto = await loadUpdater({ window: true }); await auto.handlers['set-auto-download']({}, true); await auto.api.checkInBackground();
  assert.equal(auto.calls.downloads, 1, 'automatic downloads start without asking'); assert.equal(auto.prompts.at(-1).status, 'downloaded');
  assert.equal(JSON.parse(fs.readFileSync(`${auto.userData}/updates.json`, 'utf8')).autoDownload, true);

  assert.equal(menu.normalizeNotes([{ version: '1.1.0', note: '<p>a</p>' }, { version: '1.0.1', note: null }]), '<h3>1.1.0</h3><p>a</p><h3>1.0.1</h3>');
});

test('a skipped version is not offered by background checks but stays available from the menu', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const { runInNewContext } = await import('node:vm'); const { EventEmitter } = await import('node:events');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmate-skip-')); fs.writeFileSync(path.join(userData, 'updates.json'), JSON.stringify({ skipped: '1.1.0' }));
  const updater: any = new EventEmitter(); updater.checkForUpdates = async () => updater.emit('update-available', { version: '1.1.0' });
  const prompts: any[] = [];
  const module = { exports: {} as any }; runInNewContext(fs.readFileSync('electron/updates.cjs', 'utf8'), { module, console, require: (name: string) => name === 'electron-updater' ? { autoUpdater: updater } : require(name) });
  const api = module.exports.installUpdates({ isPackaged: true, getVersion: () => '1.0.0', getPath: () => userData }, { handle: () => {} }, () => {}, () => ({ webContents: { send: (channel: string, value: any) => { if (channel === 'update-prompt') prompts.push(value); } } }), { showMessageBox: async () => ({ response: 0 }) });
  await api.checkInBackground(); assert.equal(prompts.length, 0);
  await api.checkInteractive(); assert.equal(prompts.at(-1).status, 'available');
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
