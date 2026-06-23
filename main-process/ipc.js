const { dialog, ipcMain } = require("electron");
const { resolveDroppedToImages } = require("./file-discovery");
const { processImages } = require("./image-processor");
const { resolveLogoPath } = require("./logo-paths");
const { getThumbnails } = require("./thumbnails");

let activeProcess = null;

function registerIpcHandlers() {
  ipcMain.handle("get-logo-path", () => {
    return resolveLogoPath();
  });

  ipcMain.handle("list-images", async (_event, paths) => {
    return await resolveDroppedToImages(paths);
  });

  ipcMain.handle("get-thumbnails", async (_event, paths, options) => {
    return await getThumbnails(paths, options);
  });

  ipcMain.handle("show-folder-dialog", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select output folder",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.on("process-images", async (event, payload) => {
    const webContents = event.sender;
    const processState = { canceled: false };
    activeProcess = processState;
    try {
      const summary = await processImages(payload, (progress) => {
        webContents.send("process-progress", progress);
      }, {
        shouldCancel: () => processState.canceled,
      });
      webContents.send("process-complete", { ok: true, summary });
    } catch (err) {
      webContents.send("process-complete", {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (activeProcess === processState) {
        activeProcess = null;
      }
    }
  });

  ipcMain.handle("cancel-processing", () => {
    if (!activeProcess) return false;
    activeProcess.canceled = true;
    return true;
  });
}

module.exports = {
  registerIpcHandlers,
};
