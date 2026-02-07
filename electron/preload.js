const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Add IPC methods here as needed, e.g.:
  // send: (channel, data) => ipcRenderer.send(channel, data),
  // on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
});
