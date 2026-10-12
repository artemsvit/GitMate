const { app, BrowserWindow, shell, ipcMain, dialog, net } = require('electron');
const path = require('node:path');

// Expose Electron's Chromium net.fetch to backend server to trigger native macOS Local Network prompt
globalThis.__electronNetFetch = (url, options) => net.fetch(url, options);

const standardPaths = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
process.env.PATH = Array.from(new Set([...standardPaths, ...(process.env.PATH || '').split(':')])).join(':');
if (!process.env.SSH_AUTH_SOCK) {
  try {
    process.env.SSH_AUTH_SOCK = require('node:child_process').execFileSync('launchctl', ['getenv', 'SSH_AUTH_SOCK'], { encoding: 'utf8' }).trim();
  } catch {}
}

let mainWindow = null;
let backendServer = null;
const isDev = process.env.NODE_ENV === 'development';
const PORT = Number(process.env.PORT || 3001);
const interfaceURL = isDev ? 'http://localhost:3000' : `http://localhost:${PORT}`;

function checkSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || !event.senderFrame ||
      new URL(event.senderFrame.url).origin !== interfaceURL) {
    throw new Error('Only the Gitler window can use this action.');
  }
}

ipcMain.handle('select-folder', async (event, defaultPath) => {
  checkSender(event);
  if (defaultPath !== undefined && (typeof defaultPath !== 'string' || !path.isAbsolute(defaultPath))) {
    throw new Error('The default folder must be an absolute path.');
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Folder with Git Repositories',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Select Folder',
    ...(defaultPath ? { defaultPath } : {})
  });
  return result.canceled ? null : (result.filePaths[0] || null);
});

ipcMain.handle('check-updates', async event => {
  checkSender(event);
  if (!app.isPackaged) return { available: false, message: 'Update checks require a packaged app.' };
  const { autoUpdater } = require('electron-updater');
  const result = await autoUpdater.checkForUpdates();
  return { available: Boolean(result && autoUpdater.currentVersion.compare(result.updateInfo.version) < 0), version: result?.updateInfo?.version };
});

async function startBackendServer() {
  if (isDev) return;
  backendServer = require('../server/index.cjs').server;
  if (!backendServer.listening) {
    await new Promise((resolve, reject) => {
      backendServer.once('listening', resolve);
      backendServer.once('error', reject);
    });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 600,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== interfaceURL) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.loadURL(interfaceURL).catch(error => dialog.showErrorBox('Gitler could not load', error.message));
  mainWindow.on('closed', () => { mainWindow = null; });
  if (app.isPackaged) {
    require('electron-updater').autoUpdater.checkForUpdatesAndNotify().catch(error => console.log('Update check:', error.message));
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(async () => {
    try { await startBackendServer(); createWindow(); }
    catch (error) { dialog.showErrorBox('Gitler could not start', error.message); app.quit(); }
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}
app.on('will-quit', () => backendServer?.close());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
