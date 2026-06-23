const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('photopti', {
  getLogoPath: () => ipcRenderer.invoke('get-logo-path'),
  listImages: (paths) => ipcRenderer.invoke('list-images', paths),
  getThumbnails: (paths, options) => ipcRenderer.invoke('get-thumbnails', paths, options),
  showFolderDialog: () => ipcRenderer.invoke('show-folder-dialog'),
  cancelProcessing: () => ipcRenderer.invoke('cancel-processing'),
  processImages: (paths, options) => {
    ipcRenderer.send('process-images', { paths, options });
  },
  onProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('process-progress', listener);
    return () => ipcRenderer.removeListener('process-progress', listener);
  },
  onComplete: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('process-complete', listener);
    return () => ipcRenderer.removeListener('process-complete', listener);
  }
});
