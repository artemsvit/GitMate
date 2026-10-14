const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getZoom: () => ipcRenderer.invoke('get-zoom'),
  setZoom: value => ipcRenderer.invoke('set-zoom', value),
  onZoomChanged: callback => { const handler = (_event, value) => callback(value); ipcRenderer.on('zoom-changed', handler); return () => ipcRenderer.removeListener('zoom-changed', handler); },
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  checkUpdatesInteractive: () => ipcRenderer.invoke('check-updates-interactive'),
  skipUpdate: () => ipcRenderer.invoke('skip-update'),
  setAutoDownload: value => ipcRenderer.invoke('set-auto-download', value === true),
  onUpdatePrompt: callback => { const handler = (_event, value) => callback(value); ipcRenderer.on('update-prompt', handler); return () => ipcRenderer.removeListener('update-prompt', handler); },
  onUpdateState: callback => { const handler = (_event, value) => callback(value); ipcRenderer.on('update-state', handler); return () => ipcRenderer.removeListener('update-state', handler); },
  onMenuCommand: callback => { const handler = (_event, value) => callback(value); ipcRenderer.on('menu-command', handler); return () => ipcRenderer.removeListener('menu-command', handler); },
  selectFolder: (defaultPath) => ipcRenderer.invoke('select-folder', defaultPath)
});
