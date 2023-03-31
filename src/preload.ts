const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  python: () => ipcRenderer.invoke('python-version'),
  ping: () => ipcRenderer.invoke('ping'),
})

contextBridge.exposeInMainWorld('app', {
  runPackage: (id: string, streamid: string) => ipcRenderer.invoke('run-package', id, streamid),
  stopPackage: (streamid: string) => ipcRenderer.invoke('stop-package', streamid),
  setupConnect: (url: string) => ipcRenderer.invoke('setup-connect', url),
  Signout: () => ipcRenderer.invoke('signout'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
})

