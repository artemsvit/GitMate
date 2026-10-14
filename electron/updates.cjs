const fs = require('node:fs');
const path = require('node:path');

// GitHub release notes arrive as HTML, or as a list when several versions are skipped.
function normalizeNotes(notes) {
  if (Array.isArray(notes)) return notes.map(entry => `<h3>${entry.version}</h3>${entry.note || ''}`).join('');
  return typeof notes === 'string' ? notes : '';
}

function installUpdates(app, ipcMain, checkSender, getWindow, dialog) {
  const prefsFile = path.join(app.getPath('userData'), 'updates.json');
  let prefs = { skipped: null, autoDownload: false };
  try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(prefsFile, 'utf8')) }; } catch {}
  const savePrefs = () => { try { fs.writeFileSync(prefsFile + '.tmp', JSON.stringify(prefs), { mode: 0o600 }); fs.renameSync(prefsFile + '.tmp', prefsFile); } catch {} };
  const base = () => ({ current: app.getVersion(), autoDownload: prefs.autoDownload, skipped: prefs.skipped });
  let state = { ...base(), status: 'idle', message: `You have Git Mate ${app.getVersion()}.` };
  let offered; let updater;
  const notify = next => { state = { ...base(), ...next }; getWindow()?.webContents.send('update-state', state); };
  const release = info => ({ version: info.version, releaseName: info.releaseName || '', releaseDate: info.releaseDate || '', releaseNotes: normalizeNotes(info.releaseNotes) });
  const getUpdater = () => {
    if (!app.isPackaged) throw new Error('Update checks require a packaged app.');
    if (updater) return updater;
    updater = require('electron-updater').autoUpdater;
    // Downloads need consent unless the user turned on automatic downloads; a downloaded update installs on quit.
    updater.autoDownload = false; updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => notify({ ...state, status: 'checking', message: 'Checking for updates…' }));
    updater.on('update-available', info => notify({ status: 'available', ...release(info), message: `Git Mate ${info.version} is available.` }));
    updater.on('update-not-available', () => notify({ status: 'current', message: 'You have the latest version.' }));
    updater.on('download-progress', progress => notify({ ...state, status: 'downloading', percent: progress.percent, transferred: progress.transferred, total: progress.total, bytesPerSecond: progress.bytesPerSecond, message: `Downloading update… ${Math.round(progress.percent)}%` }));
    updater.on('update-downloaded', info => notify({ status: 'downloaded', ...release(info), message: `Git Mate ${info.version} is ready. Restart to install.` }));
    updater.on('error', error => { console.error('Update failed:', error?.message || error); notify({ ...state, status: 'error', message: 'Could not complete the update. Check your connection and retry.' }); });
    return updater;
  };
  // Opens the in-app update window. Returns false when no window is open, so callers fall back to native dialogs.
  const show = () => { const window = getWindow(); if (!window) return false; if (window.isMinimized?.()) window.restore(); window.focus?.(); window.webContents.send('update-prompt', state); return true; };
  const ask = async (options) => {
    const window = getWindow();
    const result = await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
    return result.response;
  };
  const promptInstall = async () => {
    if (show()) return;
    const choice = await ask({ type: 'info', buttons: ['Restart Now', 'Later'], defaultId: 0, cancelId: 1, message: `Git Mate ${state.version} is ready to install.`, detail: 'Git Mate restarts to finish the update. If you choose Later, the update installs when you quit Git Mate.' });
    if (choice === 0) getUpdater().quitAndInstall();
  };
  const promptDownload = async () => {
    if (show()) return;
    const choice = await ask({ type: 'info', buttons: ['Download and Install', 'Not Now'], defaultId: 0, cancelId: 1, message: `Git Mate ${state.version} is available.`, detail: `You have Git Mate ${app.getVersion()}.` });
    if (choice !== 0) return;
    await getUpdater().downloadUpdate();
    if (state.status === 'downloaded') await promptInstall();
  };
  // Menu and Settings entry point: always reports the result, unlike the silent startup check.
  const checkInteractive = async () => {
    try {
      if (state.status === 'downloaded') return await promptInstall();
      if (state.status === 'available') return await promptDownload();
      if (state.status === 'checking' || state.status === 'downloading') { if (!show()) await ask({ type: 'info', buttons: ['OK'], message: state.message }); return; }
      notify({ ...state, status: 'checking', message: 'Checking for updates…' }); show();
      await getUpdater().checkForUpdates();
      if (state.status === 'available') return await promptDownload();
      if (state.status === 'current') { if (!show()) await ask({ type: 'info', buttons: ['OK'], message: 'You have the latest version.', detail: `Git Mate ${app.getVersion()} is the newest version available.` }); return; }
      throw new Error(state.message);
    } catch (error) {
      if (state.status !== 'error') notify({ ...state, status: 'error', message: 'Could not complete the update. Check your connection and retry.' });
      if (!show()) await ask({ type: 'warning', buttons: ['OK'], message: 'Git Mate could not check for updates.', detail: app.isPackaged ? state.message : error.message });
    }
  };
  // Launch and daily checks stay silent unless a version is available that the user has not seen or skipped.
  const checkInBackground = async () => {
    if (!['idle', 'current', 'error'].includes(state.status)) return;
    try { await getUpdater().checkForUpdates(); } catch { return; }
    if (state.status !== 'available' || offered === state.version || prefs.skipped === state.version) return;
    offered = state.version;
    try {
      if (prefs.autoDownload) { await getUpdater().downloadUpdate(); await promptInstall(); }
      else await promptDownload();
    } catch { if (!show()) await ask({ type: 'warning', buttons: ['OK'], message: 'Git Mate could not download the update.', detail: state.message }); }
  };
  ipcMain.handle('get-update-state', event => { checkSender(event); return state; });
  ipcMain.handle('check-updates', async event => { checkSender(event); await getUpdater().checkForUpdates(); return state; });
  ipcMain.handle('check-updates-interactive', async event => { checkSender(event); await checkInteractive(); return state; });
  ipcMain.handle('download-update', async event => { checkSender(event); if (state.status !== 'available') throw new Error('Check for an available update first.'); await getUpdater().downloadUpdate(); return state; });
  ipcMain.handle('install-update', event => { checkSender(event); if (state.status !== 'downloaded') throw new Error('Download the update first.'); getUpdater().quitAndInstall(); });
  ipcMain.handle('skip-update', event => { checkSender(event); if (!state.version) throw new Error('No update to skip.'); prefs.skipped = state.version; savePrefs(); notify(state); return state; });
  ipcMain.handle('set-auto-download', (event, value) => { checkSender(event); prefs.autoDownload = value === true; savePrefs(); notify(state); return state; });
  return { checkInBackground, checkInteractive };
}
module.exports = { installUpdates, normalizeNotes };
