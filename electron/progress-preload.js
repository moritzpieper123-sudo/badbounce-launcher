/* Preload of the progress window: tasks in, full-screen toggle out. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bbViewer', {
  onTasks: (cb) => ipcRenderer.on('tasks', (_e, l) => cb(l)),
  onConfig: (cb) => ipcRenderer.on('viewerConfig', (_e, c) => cb(c)),
  ready: () => ipcRenderer.send('viewerReady'),
  toggleFull: () => ipcRenderer.send('progressFull'),
});
