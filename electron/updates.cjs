function installUpdates(app, ipcMain, checkSender, getWindow) {
  let state = { status: 'idle', message: 'Check for a newer Gitler version.' };
  let updater;
  const notify = next => { state = next; getWindow()?.webContents.send('update-state', state); };
  const getUpdater = () => {
    if (!app.isPackaged) throw new Error('Update checks require a packaged app.');
    if (updater) return updater;
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = false; updater.autoInstallOnAppQuit = false;
    updater.on('checking-for-update', () => notify({ status: 'checking', message: 'Checking for updates…' }));
    updater.on('update-available', info => notify({ status: 'available', version: info.version, message: `Gitler ${info.version} is available.` }));
    updater.on('update-not-available', () => notify({ status: 'current', message: 'You have the latest version.' }));
    updater.on('download-progress', progress => notify({ status: 'downloading', percent: progress.percent, message: `Downloading update… ${Math.round(progress.percent)}%` }));
    updater.on('update-downloaded', info => notify({ status: 'downloaded', version: info.version, message: `Gitler ${info.version} is ready. Restart to install.` }));
    updater.on('error', () => notify({ status: 'error', message: 'Could not complete the update. Check your connection and retry.' }));
    return updater;
  };
  ipcMain.handle('get-update-state', event => { checkSender(event); return state; });
  ipcMain.handle('check-updates', async event => { checkSender(event); await getUpdater().checkForUpdates(); return state; });
  ipcMain.handle('download-update', async event => { checkSender(event); if (state.status !== 'available') throw new Error('Check for an available update first.'); await getUpdater().downloadUpdate(); return state; });
  ipcMain.handle('install-update', event => { checkSender(event); if (state.status !== 'downloaded') throw new Error('Download the update first.'); getUpdater().quitAndInstall(); });
  return { check: () => getUpdater().checkForUpdates() };
}
module.exports = { installUpdates };
