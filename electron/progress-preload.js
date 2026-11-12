/* Preload of the progress window: only lets the page switch full screen on and off. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bbProgress', {
  toggleFull: () => ipcRenderer.send('progressFull'),
  isFull: () => ipcRenderer.sendSync('progressIsFull'),
});
