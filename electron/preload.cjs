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
  onUpdateState: callback => { const handler = (_event, value) => callback(value); ipcRenderer.on('update-state', handler); return () => ipcRenderer.removeListener('update-state', handler); },
  selectFolder: (defaultPath) => ipcRenderer.invoke('select-folder', defaultPath)
});
