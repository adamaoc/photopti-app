const { contextBridge, ipcRenderer, webUtils } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('photopti', {
  platform: process.platform,
  getLogoUrl: () => ipcRenderer.invoke('get-logo-url'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  listImages: (paths, options) => ipcRenderer.invoke('list-images', paths, options),
  showInputDialog: (kind) => ipcRenderer.invoke('show-input-dialog', kind),
  getThumbnails: (paths, options) => ipcRenderer.invoke('get-thumbnails', paths, options),
  getImageInfo: (filePath) => ipcRenderer.invoke('get-image-info', filePath),
  showFolderDialog: () => ipcRenderer.invoke('show-folder-dialog'),
  openOutputFolder: (dir) => ipcRenderer.invoke('open-output-folder', dir),
  cancelProcessing: () => ipcRenderer.invoke('cancel-processing'),
  processImages: (paths, sourceRoots, options) => {
    ipcRenderer.send('process-images', { paths, sourceRoots, options });
  },
  onProgress: (callback) => subscribe('process-progress', callback),
  onComplete: (callback) => subscribe('process-complete', callback)
});
