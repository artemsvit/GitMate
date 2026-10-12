import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 3001;

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
      preload: path.join(__dirname, 'preload.js'),
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
    // In production, connect to the embedded backend server or static build
    mainWindow.loadURL(`http://localhost:${PORT}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates via Sparkle / electron-updater in production
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.log('Update check error:', err);
    });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
