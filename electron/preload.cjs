const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  selectFolder: () => ipcRenderer.invoke('select-folder')
});
