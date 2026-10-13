const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getZoom: () => ipcRenderer.invoke('get-zoom'),
  setZoom: value => ipcRenderer.invoke('set-zoom', value),
  onZoomChanged: callback => { const handler = (_event, value) => callback(value); ipcRenderer.on('zoom-changed', handler); return () => ipcRenderer.removeListener('zoom-changed', handler); },
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  selectFolder: (defaultPath) => ipcRenderer.invoke('select-folder', defaultPath)
});
