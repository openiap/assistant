// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
// window.addEventListener("DOMContentLoaded", () => {
//   const replaceText = (selector: string, text: string) => {
//     const element = document.getElementById(selector);
//     if (element) {
//       element.innerText = text;
//     }
//   };

//   for (const type of ["chrome", "node", "electron"]) {
//     replaceText(`${type}-version`, process.versions[type as keyof NodeJS.ProcessVersions]);
//   }
// });

const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  ping: () => ipcRenderer.invoke('ping'),
})

contextBridge.exposeInMainWorld('app', {
  openPackage: (id:string, streamid:string) => ipcRenderer.invoke('open-package', id, streamid),
  stopPackage: (streamid:string) => ipcRenderer.invoke('stop-package', streamid),
  setupConnect: (url:string) => ipcRenderer.invoke('setup-connect', url),
  Signout: () => ipcRenderer.invoke('signout'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
})

