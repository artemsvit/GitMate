const { app, BrowserWindow, Menu, shell, ipcMain, dialog, session } = require('electron');
const path = require('node:path');

// The app data folder follows the package name. Move it from the earlier "gitler" name once, before Electron opens it.
try {
  const previous = path.join(app.getPath('appData'), 'gitler'); const current = app.getPath('userData');
  if (current !== previous && require('node:fs').existsSync(previous) && !require('node:fs').existsSync(current)) require('node:fs').renameSync(previous, current);
} catch {}
const { networkPermissions, trustedInterfacePermission } = require('./permissions.cjs');

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
    throw new Error('Only the Git Mate window can use this action.');
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

let attachZoom;
let updates;
let updateTimer;
function createWindow() {
  mainWindow = new BrowserWindow({
    show: false, width: 1280, height: 820, minWidth: 960, minHeight: 600,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true
    }
  });
  attachZoom(mainWindow);
  mainWindow.once('ready-to-show', () => { mainWindow.maximize(); mainWindow.show(); });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== interfaceURL) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(trustedInterfacePermission(contents, permission, details.requestingUrl, interfaceURL));
  });
  mainWindow.webContents.session.setPermissionCheckHandler((contents, permission, origin) => {
    return trustedInterfacePermission(contents, permission, origin, interfaceURL);
  });
  mainWindow.loadURL(interfaceURL).catch(error => dialog.showErrorBox('Git Mate could not load', error.message));
  mainWindow.on('closed', () => { mainWindow = null; });
  if (app.isPackaged && !updateTimer) {
    mainWindow.once('ready-to-show', () => updates.checkInBackground());
    updateTimer = setInterval(() => updates.checkInBackground(), 24 * 60 * 60 * 1000);
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(async () => {
    try {
      // This partition has no web pages. Only backend provider requests use it.
      const providerSession = session.fromPartition('gitmate-provider-network');
      providerSession.setPermissionRequestHandler((_contents, permission, callback) => callback(networkPermissions.has(permission)));
      providerSession.setPermissionCheckHandler((_contents, permission) => networkPermissions.has(permission));
      globalThis.__electronNetFetch = (url, options) => providerSession.fetch(url, options);
      updates = require('./updates.cjs').installUpdates(app, ipcMain, checkSender, () => mainWindow, dialog);
      require('./menu.cjs').installMenu(app, Menu, () => updates.checkInteractive());
      attachZoom = require('./zoom.cjs').installZoom(app, ipcMain, checkSender, () => mainWindow);
      await startBackendServer();
      createWindow();
    }
    catch (error) { dialog.showErrorBox('Git Mate could not start', error.message); app.quit(); }
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}
app.on('will-quit', () => backendServer?.close());
// Git Mate has one main window, so closing it quits and releases the local server and the model.
app.on('window-all-closed', () => app.quit());
