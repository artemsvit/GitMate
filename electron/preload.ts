import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  checkUpdates: () => ipcRenderer.invoke('check-updates')
});
