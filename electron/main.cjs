const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');

ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Folder with Git Repositories',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Select Folder'
  });
  if (result.canceled || !result.filePaths || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

let mainWindow = null;
let serverProcess = null;
const isDev = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 3001;

function startBackendServer() {
  if (isDev) return;
  try {
    // When running inside packaged .app, start the Express backend
    const serverScript = path.join(__dirname, '../server/index.cjs');
    serverProcess = fork(serverScript, [], {
      env: { ...process.env, PORT: String(PORT) },
      silent: false
    });
    serverProcess.on('error', err => console.error('Backend server error:', err));
  } catch (err) {
    console.error('Failed to spawn backend server:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // Wait briefly for server to bind if just started, then load
    mainWindow.loadURL(`http://localhost:${PORT}`).catch(() => {
      setTimeout(() => mainWindow && mainWindow.loadURL(`http://localhost:${PORT}`), 1000);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates via Sparkle / electron-updater in production
  if (!isDev) {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.log('Update check error:', err);
      });
    } catch {
      // Updater not available in dev or unsigned builds
    }
  }
}

app.whenReady().then(() => {
  startBackendServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
