function installUpdates(app, ipcMain, checkSender, getWindow, dialog) {
  let state = { status: 'idle', message: `You have Gitler ${app.getVersion()}.` };
  let offered;
  let updater;
  const notify = next => { state = next; getWindow()?.webContents.send('update-state', state); };
  const getUpdater = () => {
    if (!app.isPackaged) throw new Error('Update checks require a packaged app.');
    if (updater) return updater;
    updater = require('electron-updater').autoUpdater;
    // Downloads need consent; a downloaded update installs on the next quit if the user does not restart now.
    updater.autoDownload = false; updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => notify({ status: 'checking', message: 'Checking for updates…' }));
    updater.on('update-available', info => notify({ status: 'available', version: info.version, message: `Gitler ${info.version} is available.` }));
    updater.on('update-not-available', () => notify({ status: 'current', message: 'You have the latest version.' }));
    updater.on('download-progress', progress => notify({ status: 'downloading', percent: progress.percent, message: `Downloading update… ${Math.round(progress.percent)}%` }));
    updater.on('update-downloaded', info => notify({ status: 'downloaded', version: info.version, message: `Gitler ${info.version} is ready. Restart to install.` }));
    updater.on('error', error => { console.error('Update failed:', error?.message || error); notify({ status: 'error', message: 'Could not complete the update. Check your connection and retry.' }); });
    return updater;
  };
  const ask = async (options) => {
    const window = getWindow();
    const result = await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
    return result.response;
  };
  const promptInstall = async () => {
    const choice = await ask({ type: 'info', buttons: ['Restart Now', 'Later'], defaultId: 0, cancelId: 1, message: `Gitler ${state.version} is ready to install.`, detail: 'Gitler restarts to finish the update. If you choose Later, the update installs when you quit Gitler.' });
    if (choice === 0) getUpdater().quitAndInstall();
  };
  const promptDownload = async () => {
    const choice = await ask({ type: 'info', buttons: ['Download and Install', 'Not Now'], defaultId: 0, cancelId: 1, message: `Gitler ${state.version} is available.`, detail: `You have Gitler ${app.getVersion()}.` });
    if (choice !== 0) return;
    await getUpdater().downloadUpdate();
    if (state.status === 'downloaded') await promptInstall();
  };
  // Menu entry point: always reports the result, unlike the silent startup check.
  const checkInteractive = async () => {
    try {
      if (state.status === 'downloaded') return await promptInstall();
      if (state.status === 'checking' || state.status === 'downloading') return await ask({ type: 'info', buttons: ['OK'], message: state.message });
      if (state.status !== 'available') await getUpdater().checkForUpdates();
      if (state.status === 'available') return await promptDownload();
      if (state.status === 'current') return await ask({ type: 'info', buttons: ['OK'], message: 'You have the latest version.', detail: `Gitler ${app.getVersion()} is the newest version available.` });
      throw new Error(state.message);
    } catch (error) {
      if (state.status !== 'error') notify({ status: 'error', message: 'Could not complete the update. Check your connection and retry.' });
      await ask({ type: 'warning', buttons: ['OK'], message: 'Gitler could not check for updates.', detail: app.isPackaged ? state.message : error.message });
    }
  };
  // Launch and daily checks stay silent unless a version the user has not seen yet is available.
  const checkInBackground = async () => {
    if (!['idle', 'current', 'error'].includes(state.status)) return;
    try { await getUpdater().checkForUpdates(); } catch { return; }
    if (state.status === 'available' && offered !== state.version) {
      offered = state.version;
      try { await promptDownload(); } catch (error) { await ask({ type: 'warning', buttons: ['OK'], message: 'Gitler could not download the update.', detail: state.message }); }
    }
  };
  ipcMain.handle('get-update-state', event => { checkSender(event); return state; });
  ipcMain.handle('check-updates', async event => { checkSender(event); await getUpdater().checkForUpdates(); return state; });
  ipcMain.handle('download-update', async event => { checkSender(event); if (state.status !== 'available') throw new Error('Check for an available update first.'); await getUpdater().downloadUpdate(); return state; });
  ipcMain.handle('install-update', event => { checkSender(event); if (state.status !== 'downloaded') throw new Error('Download the update first.'); getUpdater().quitAndInstall(); });
  return { checkInBackground, checkInteractive };
}
module.exports = { installUpdates };
