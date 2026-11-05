const { contextBridge, ipcRenderer } = require('electron');

const on = (ch, cb) => { const h = (_e, ...a) => cb(...a); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };

contextBridge.exposeInMainWorld('bb', {
  getSnapshot: () => ipcRenderer.invoke('snapshot'),
  saveState: (s) => ipcRenderer.invoke('save', s),
  onChange: (cb) => on('changed', cb),
  uploadPack: (n) => ipcRenderer.invoke('uploadPack', n),
  copyText: (t) => ipcRenderer.invoke('copy', t),
  openUrl: (u) => ipcRenderer.invoke('openUrl', u),
  openPath: (p) => ipcRenderer.invoke('openPath', p),
  openVault: (s) => ipcRenderer.invoke('openVault', s),
  saveIdeaFile: (name, data) => ipcRenderer.invoke('saveIdeaFile', name, data),
  backupNow: () => ipcRenderer.invoke('backupNow'),
  runGen: (n) => ipcRenderer.invoke('runGen', n),
  setAutostart: (on2) => ipcRenderer.invoke('setAutostart', on2),
  setVault: (p) => ipcRenderer.invoke('setVault', p),
  fileUrl: (p) => 'bbfile://f/' + encodeURIComponent(p),
  islandHover: (v) => ipcRenderer.send('islandHover', v),
  islandSize: (m) => ipcRenderer.send('islandSize', m),
  showMain: (p) => ipcRenderer.send('showMain', p),
  onNavigate: (cb) => on('navigate', cb),
  onIslandToast: (cb) => on('islandToast', cb),
  islandToast: (t, s) => ipcRenderer.send('islandToast', t, s),
  mailConnect: (id, secret) => ipcRenderer.invoke('mailConnect', id, secret),
  mailDisconnect: () => ipcRenderer.invoke('mailDisconnect'),
  mailBody: (id) => ipcRenderer.invoke('mailBody', id),
  mailRefresh: () => ipcRenderer.invoke('mailRefresh'),
});
